import { computeContentHash } from "@/lib/content-hash";
import {
  buildProcessSearchText,
  isProcessRelevant,
  loadOrgContentFilters,
  matchesOrgContentFilters,
} from "@/lib/dashboard/process-relevance";
import { isExcluded } from "@/lib/dashboard/content-match";
import { extractRubroSearchTerms } from "@/lib/onboarding/rubros-unspsc";
import { looksLikeProcessCodigo } from "@/lib/dashboard/process-codigo";
import { isTerminalMpEstado, processNeedsApiRefresh, type SyncScope } from "@/lib/ingest/sync-refresh";
import { DEFAULT_ORG_ID, type DashboardSyncBatchResult, type IngestSummary, type ProcessInsert, type ProcessTipo } from "@/types/database";
import { parseMontoFromApi } from "@/lib/montos";
import { createNotificationIfAbsent } from "@/lib/notifications/create";
import { isPastCierre } from "@/lib/dashboard/cierre-display";
import { createServiceClient } from "@/lib/supabase/server";
import {
  chileDateIso,
  fetchCompraAgilByCodigo,
  fetchCompraAgilForTerms,
  fetchCompraAgilPublishedSince,
  fetchLicitacionByCodigo,
  fetchLicitacionesByFecha,
  inferProcessTipo,
  normalizeCompraAgil,
  normalizeLicitacion,
  stripAccents,
  type NormalizedProcess,
} from "@/lib/chilecompra/client";
import {
  MP_INITIAL_SYNC_DAYS,
  MP_INITIAL_SYNC_HOURS,
  MP_LICITACION_DATE_DELAY_MS,
  MP_SYNC_COOLDOWN_HOURS,
  MP_SYNC_DATE_OVERLAP_DAYS,
  MP_SYNC_OVERLAP_HOURS,
  MP_CA_SYNC_DAYS,
  MP_CA_PAGES_PER_KEYWORD,
  MP_CA_KEYWORDS_PER_BATCH,
  MP_CA_CANDIDATE_MAX,
  MP_LICITACION_CANDIDATE_MAX,
} from "@/lib/chilecompra/rate-limit";
import { archiveStaleDashboardProcesses } from "@/lib/dashboard/archive-processes";

function normalizeRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatApiDateChile(date: Date): string {
  const iso = chileDateIso(date);
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}${mm}${yyyy}`;
}

function chileDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Rango de fechas DDMMYYYY (Chile) para consultar licitaciones. */
function buildSyncDateRange(lastSyncAt: string | null): {
  dates: string[];
  mode: "initial" | "incremental";
  light: boolean;
} {
  const todayIso = chileDateIso();
  const today = chileDateFromIso(todayIso);

  if (!lastSyncAt) {
    const dates: string[] = [];
    const days = Math.max(1, Math.min(MP_INITIAL_SYNC_DAYS, 31));
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - offset);
      dates.push(formatApiDateChile(d));
    }
    return { dates, mode: "initial", light: false };
  }

  const hoursSince =
    (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  const lastIso = chileDateIso(new Date(lastSyncAt));

  if (hoursSince < MP_SYNC_COOLDOWN_HOURS && lastIso === todayIso) {
    const dates: string[] = [formatApiDateChile(today)];
    if (MP_SYNC_DATE_OVERLAP_DAYS > 0) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      dates.unshift(formatApiDateChile(yesterday));
    }
    return { dates, mode: "incremental", light: true };
  }

  let cursor = chileDateFromIso(lastIso);
  const overlap = Math.max(0, Math.min(MP_SYNC_DATE_OVERLAP_DAYS, 7));
  if (overlap > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - overlap);
  }
  const dates: string[] = [];

  while (cursor.getTime() <= today.getTime()) {
    dates.push(formatApiDateChile(cursor));
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    dates: dates.length ? dates : [formatApiDateChile(today)],
    mode: "incremental",
    light: false,
  };
}

function passesCaDiscoverFilter(
  process: NormalizedProcess,
  filters: Awaited<ReturnType<typeof loadOrgContentFilters>>
): boolean {
  const fullText = buildProcessSearchText({
    nombre: process.nombre,
    servicios_requeridos: process.servicios_requeridos,
    descripcion: process.descripcion,
  });
  if (isExcluded(fullText)) return false;
  return matchesOrgContentFilters(
    fullText,
    filters.keywords,
    filters.rubros,
    process.rubros_unspsc
  );
}

function passesLicitacionDiscoverFilter(
  process: NormalizedProcess,
  filters: Awaited<ReturnType<typeof loadOrgContentFilters>>
): boolean {
  const fullText = buildProcessSearchText({
    nombre: process.nombre,
    servicios_requeridos: process.servicios_requeridos,
    descripcion: process.descripcion,
  });
  if (isExcluded(fullText)) return false;
  return matchesOrgContentFilters(
    fullText,
    filters.keywords,
    filters.rubros,
    process.rubros_unspsc
  );
}

function passesPostEnrichFilter(
  process: NormalizedProcess,
  filters: Awaited<ReturnType<typeof loadOrgContentFilters>>
): boolean {
  const fullText = buildProcessSearchText({
    nombre: process.nombre,
    servicios_requeridos: process.servicios_requeridos,
    descripcion: process.descripcion,
  });
  if (isExcluded(fullText)) return false;
  return matchesOrgContentFilters(
    fullText,
    filters.keywords,
    filters.rubros,
    process.rubros_unspsc
  );
}

function formatSyncProcessError(codigo: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : "Error";
  if (/504|503|502|timeout|no respondió/i.test(raw)) {
    return `${codigo}: MP no respondió (timeout), se reintentará en la próxima sync`;
  }
  if (/429|cuota/i.test(raw)) {
    return `${codigo}: cuota API MP`;
  }
  return `${codigo}: ${raw.replace(/https?:\/\S+/g, "").trim()}`.slice(0, 100);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichWithFullDetail(
  ticket: string,
  codigo: string,
  tipo: ProcessTipo
): Promise<NormalizedProcess | null> {
  return refreshProcessByCodigo(ticket, codigo, tipo);
}

async function updateLastMpSyncAt(
  supabase: ReturnType<typeof createServiceClient>,
  scope: Exclude<SyncScope, "all">,
  source: "manual" | "cron" = "manual"
) {
  const col = scope === "compra_agil" ? "last_mp_sync_ca_at" : "last_mp_sync_lic_at";
  const sourceCol =
    scope === "compra_agil"
      ? source === "cron"
        ? "last_mp_sync_ca_cron_at"
        : "last_mp_sync_ca_manual_at"
      : source === "cron"
        ? "last_mp_sync_lic_cron_at"
        : "last_mp_sync_lic_manual_at";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("org_settings")
    .update({
      [col]: now,
      [sourceCol]: now,
      last_mp_sync_at: now,
      updated_at: now,
    })
    .eq("organization_id", DEFAULT_ORG_ID);
  if (error) throw new Error(error.message);
}

/** Marca avance del cron aunque la cola siga pendiente (sync parcial nocturna). */
async function touchCronSyncTimestamp(scope: Exclude<SyncScope, "all">): Promise<void> {
  const supabase = createServiceClient();
  const sourceCol =
    scope === "compra_agil" ? "last_mp_sync_ca_cron_at" : "last_mp_sync_lic_cron_at";
  const now = new Date().toISOString();
  await supabase
    .from("org_settings")
    .update({ [sourceCol]: now, updated_at: now })
    .eq("organization_id", DEFAULT_ORG_ID);
}

const CRON_CA_CANDIDATE_CAP = 60;
const CRON_CA_KEYWORDS_PER_BATCH = 4;

async function preparePendingForCron(
  supabase: ReturnType<typeof createServiceClient>,
  scope: Exclude<SyncScope, "all">,
  pending: MpSyncPending
): Promise<MpSyncPending> {
  pending.cron_run = true;

  if (pending.index > 0) {
    pending.candidates = pending.candidates.slice(pending.index);
    pending.index = 0;
    pending.fetched = pending.candidates.length;
  }

  if (scope === "compra_agil" && pending.ca_discover_mode === "nightly") {
    pending.ca_keywords_skipped = false;
  }

  if (pending.candidates.length > CRON_CA_CANDIDATE_CAP) {
    pending.candidates = pending.candidates.slice(0, CRON_CA_CANDIDATE_CAP);
    pending.fetched = pending.candidates.length;
  }

  await saveMpSyncPending(supabase, scope, pending);
  return pending;
}

async function closeStaleSyncRuns(supabase: ReturnType<typeof createServiceClient>) {
  await supabase
    .from("sync_runs")
    .update({
      status: "failed",
      errors: ["Interrumpida por una nueva sincronización"],
      finished_at: new Date().toISOString(),
    })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("status", "running");
}

function mergeEstado(
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  return existing?.trim() || null;
}

function mergeString(
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  return existing?.trim() || null;
}

function mergeNumber(
  incoming: number | null | undefined,
  existing: number | null | undefined
): number | null {
  if (incoming !== null && incoming !== undefined) return incoming;
  return existing ?? null;
}

function mergeBool(incoming: boolean, existing: boolean | undefined): boolean {
  return incoming || Boolean(existing);
}

async function getOrgContext() {
  const supabase = createServiceClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, rut, rut_dv")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  const { data: settings } = await supabase
    .from("org_settings")
    .select("chilecompra_ticket, anthropic_api_key_encrypted, anthropic_api_key_status")
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();

  const orgRut = org?.rut
    ? normalizeRut(`${org.rut}${org.rut_dv ?? ""}`)
    : null;

  return { supabase, orgRut, ticket: settings?.chilecompra_ticket ?? null };
}

function mergeStringArray(incoming: string[], existing: string[] | null | undefined): string[] {
  if (incoming.length > 0) return incoming;
  return existing ?? [];
}

async function upsertProcess(
  supabase: ReturnType<typeof createServiceClient>,
  normalized: NormalizedProcess,
  orgRut: string | null,
  options?: {
    notifyFilters?: Awaited<ReturnType<typeof loadOrgContentFilters>>;
    markDashboardSync?: boolean;
    forceRefresh?: boolean;
  }
): Promise<"created" | "updated"> {
  const notifyFilters = options?.notifyFilters;
  const adjudicadoRut = normalizeRut(normalized.adjudicado_rut);
  const adjudicadoAMi = Boolean(orgRut && adjudicadoRut && orgRut === adjudicadoRut);

  const { data: existing } = await supabase
    .from("processes")
    .select(
      "id, estado, content_hash, adjudicado_a_mi, nombre, servicios_requeridos, synced_via_dashboard, descripcion, tipo_detalle, monto_estimado, monto_raw_api, monto_sospechoso, organismo_nombre, organismo_rut, unidad_compra, lugar_ejecucion, fecha_publicacion, fecha_cierre, fecha_cierre_2, hora_publicacion, hora_cierre, hora_cierre_2, url_publica, adjudicado_rut, adjudicado_nombre, rubros_unspsc, dashboard_archived_at"
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("codigo_externo", normalized.codigo_externo)
    .maybeSingle();

  if (existing?.dashboard_archived_at && !options?.forceRefresh) {
    return "updated";
  }

  const estadoFinal = mergeEstado(normalized.estado, existing?.estado);

  const row: ProcessInsert = {
    organization_id: DEFAULT_ORG_ID,
    codigo_externo: normalized.codigo_externo,
    tipo: normalized.tipo,
    estado: estadoFinal,
    nombre: normalized.nombre,
    descripcion: mergeString(normalized.descripcion, existing?.descripcion),
    tipo_detalle: mergeString(normalized.tipo_detalle, existing?.tipo_detalle),
    monto_estimado: mergeNumber(normalized.monto_estimado, existing?.monto_estimado),
    monto_raw_api: mergeString(normalized.monto_raw_api, existing?.monto_raw_api),
    monto_sospechoso: mergeBool(normalized.monto_sospechoso, existing?.monto_sospechoso),
    organismo_nombre: mergeString(normalized.organismo_nombre, existing?.organismo_nombre),
    organismo_rut: mergeString(normalized.organismo_rut, existing?.organismo_rut),
    unidad_compra: mergeString(normalized.unidad_compra, existing?.unidad_compra),
    lugar_ejecucion: mergeString(normalized.lugar_ejecucion, existing?.lugar_ejecucion),
    fecha_publicacion: mergeString(
      normalized.fecha_publicacion,
      existing?.fecha_publicacion
    ),
    fecha_cierre: mergeString(normalized.fecha_cierre, existing?.fecha_cierre),
    fecha_cierre_2: mergeString(normalized.fecha_cierre_2, existing?.fecha_cierre_2),
    hora_publicacion: mergeString(normalized.hora_publicacion, existing?.hora_publicacion),
    hora_cierre: mergeString(normalized.hora_cierre, existing?.hora_cierre),
    hora_cierre_2: mergeString(normalized.hora_cierre_2, existing?.hora_cierre_2),
    servicios_requeridos: mergeString(
      normalized.servicios_requeridos,
      existing?.servicios_requeridos
    ),
    url_publica: mergeString(normalized.url_publica, existing?.url_publica),
    adjudicado_rut: mergeString(normalized.adjudicado_rut, existing?.adjudicado_rut),
    adjudicado_nombre: mergeString(
      normalized.adjudicado_nombre,
      existing?.adjudicado_nombre
    ),
    rubros_unspsc: mergeStringArray(normalized.rubros_unspsc ?? [], existing?.rubros_unspsc),
    adjudicado_a_mi: adjudicadoAMi,
    content_hash: normalized.content_hash,
    last_synced_at: new Date().toISOString(),
    synced_via_dashboard: options?.markDashboardSync
      ? true
      : (existing?.synced_via_dashboard ?? false),
  };

  const { data, error } = await supabase
    .from("processes")
    .upsert(row, { onConflict: "organization_id,codigo_externo" })
    .select("id, estado")
    .single();

  if (error) throw new Error(error.message);

  const wasCreated = !existing;

  if (adjudicadoAMi && !existing?.adjudicado_a_mi) {
    await createNotificationIfAbsent(supabase, {
      tipo: "adjudicacion_propia",
      titulo: "¡Adjudicado a ti!",
      mensaje: `El proceso ${normalized.codigo_externo} — ${normalized.nombre} fue adjudicado a tu empresa.`,
      process_id: data.id,
    });
  }

  return wasCreated ? "created" : "updated";
}

async function fetchLicitacionesForDates(
  ticket: string,
  dates: string[],
  onError?: (msg: string) => void
): Promise<NormalizedProcess[]> {
  const results: NormalizedProcess[] = [];
  for (const fecha of dates) {
    try {
      const licitaciones = await fetchLicitacionesByFecha(ticket, fecha);
      results.push(...licitaciones.map(normalizeLicitacion));
    } catch (err) {
      onError?.(`Licitaciones ${fecha}: ${err instanceof Error ? err.message : "Error"}`);
    }
    await delay(MP_LICITACION_DATE_DELAY_MS);
  }
  return results;
}

function buildCompraAgilSearchTerms(
  keywords: string[],
  rubros: Array<{ nombre: string }>
): string[] {
  const rubroTerms = extractRubroSearchTerms(rubros);
  const keywordTerms: string[] = [];
  for (const keyword of keywords) {
    const normalized = stripAccents(keyword).trim().toLowerCase();
    if (normalized.length >= 3) keywordTerms.push(normalized);
  }
  return [...new Set([...rubroTerms, ...keywordTerms])];
}

type CaDiscoverMode = "initial" | "incremental" | "nightly";

function resolveCaPublicadoDesdeIso(
  lastSyncAt: string | null,
  mode: CaDiscoverMode
): string {
  const windowMs = MP_INITIAL_SYNC_HOURS * 60 * 60 * 1000;
  const overlapMs = MP_SYNC_OVERLAP_HOURS * 60 * 60 * 1000;

  if (mode === "initial") {
    return chileDateIso(new Date(Date.now() - windowMs));
  }

  if (mode === "nightly") {
    if (lastSyncAt) {
      return chileDateIso(new Date(new Date(lastSyncAt).getTime() - overlapMs));
    }
    return chileDateIso(new Date(Date.now() - windowMs));
  }

  if (!lastSyncAt) {
    return chileDateIso(new Date(Date.now() - windowMs));
  }

  return chileDateIso(new Date(new Date(lastSyncAt).getTime() - overlapMs));
}

function compraAgilPublicadoDesdeIso(lastSyncAt: string | null, mode: CaDiscoverMode): string {
  return resolveCaPublicadoDesdeIso(lastSyncAt, mode);
}

function countCandidatesByTipo(
  pending: MpSyncPending,
  tipo: ProcessTipo
): number {
  return pending.candidates.filter((c) => c.tipo === tipo).length;
}

function appendCaCandidate(
  pending: MpSyncPending,
  process: NormalizedProcess,
  seen: Set<string>
): boolean {
  if (seen.has(process.codigo_externo)) return false;
  if (countCandidatesByTipo(pending, "compra_agil") >= MP_CA_CANDIDATE_MAX) return false;
  seen.add(process.codigo_externo);
  pending.candidates.push({
    codigo_externo: process.codigo_externo,
    tipo: process.tipo,
    nombre: process.nombre,
  });
  return true;
}

async function fetchAllCompraAgilForBackfill(
  ticket: string,
  keywords: string[],
  rubros: Array<{ nombre: string }>,
  onError?: (msg: string) => void,
  discoverMode: CaDiscoverMode = "initial",
  lastSyncAt: string | null = null
): Promise<NormalizedProcess[]> {
  const seen = new Set<string>();
  const merged: NormalizedProcess[] = [];
  const publicadoDesde = compraAgilPublicadoDesdeIso(lastSyncAt, discoverMode);
  const filters = await loadOrgContentFilters();

  const addIfRelevant = (normalized: NormalizedProcess) => {
    if (seen.has(normalized.codigo_externo)) return;
    if (!passesCaDiscoverFilter(normalized, filters)) return;
    seen.add(normalized.codigo_externo);
    merged.push(normalized);
  };

  const terms = buildCompraAgilSearchTerms(filters.keywords, filters.rubros);
  for (let offset = 0; offset < terms.length; offset += MP_CA_KEYWORDS_PER_BATCH) {
    try {
      const batch = await fetchCompraAgilForTerms(
        ticket,
        terms,
        MP_CA_PAGES_PER_KEYWORD,
        {
          startIndex: offset,
          batchSize: MP_CA_KEYWORDS_PER_BATCH,
          publicadoDesde,
        }
      );
      for (const normalized of batch) addIfRelevant(normalized);
    } catch (err) {
      onError?.(`Compra ágil (keywords): ${err instanceof Error ? err.message : "Error"}`);
    }
  }

  try {
    const rawItems = await fetchCompraAgilPublishedSince(
      ticket,
      publicadoDesde,
      discoverMode === "nightly" ? 6 : 3
    );
    for (const raw of rawItems) {
      addIfRelevant(normalizeCompraAgil(raw));
    }
  } catch (err) {
    onError?.(`Compra ágil (listado reciente): ${err instanceof Error ? err.message : "Error"}`);
  }

  return merged;
}

async function fetchDailyProcessesWithCompraAgil(
  ticket: string,
  keywords: string[],
  rubros: Array<{ nombre: string }>
): Promise<NormalizedProcess[]> {
  const today = new Date();
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return formatApiDateChile(d);
  });
  const lic = await fetchLicitacionesForDates(ticket, dates);
  const ca = await fetchAllCompraAgilForBackfill(ticket, keywords, rubros);
  return [...lic, ...ca];
}

const SYNC_BATCH_SIZE = 8;
/** Tiempo máximo por request HTTP (~55 s) para evitar timeout del navegador. */
const SYNC_BATCH_BUDGET_MS = 55_000;

interface MpSyncPending {
  candidates: Array<{ codigo_externo: string; tipo: ProcessTipo; nombre: string }>;
  index: number;
  mode: "initial" | "incremental";
  daysQueried: number;
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
  ca_fetched: boolean;
  ca_term_offset?: number;
  ca_search_terms?: string[];
  ca_discover_mode?: CaDiscoverMode;
  ca_publicado_desde?: string;
  ca_recent_scanned?: boolean;
  ca_keywords_skipped?: boolean;
  cron_run?: boolean;
  candidates_prioritized?: boolean;
  finalized?: boolean;
  light?: boolean;
}

function buildBatchResult(
  pending: MpSyncPending,
  done: boolean,
  phase?: DashboardSyncBatchResult["phase"]
): DashboardSyncBatchResult {
  return {
    done,
    phase,
    summary: {
      fetched: pending.fetched,
      created: pending.created,
      updated: pending.updated,
      evaluatedIa: 0,
      errors: pending.errors.slice(0, 20),
      mode: pending.mode,
      daysQueried: pending.daysQueried,
    },
    progress: { total: pending.candidates.length, processed: pending.index },
  };
}

async function loadMpSyncPending(
  supabase: ReturnType<typeof createServiceClient>,
  scope: Exclude<SyncScope, "all">
): Promise<MpSyncPending | null> {
  const pendingCol = scope === "compra_agil" ? "mp_sync_pending_ca" : "mp_sync_pending_lic";
  const { data } = await supabase
    .from("org_settings")
    .select(`${pendingCol}, mp_sync_pending`)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();

  const settings = data as Record<string, unknown> | null;
  let raw = settings?.[pendingCol];
  if (!raw && settings?.mp_sync_pending && typeof settings.mp_sync_pending === "object") {
    raw = settings.mp_sync_pending;
  }
  if (!raw || typeof raw !== "object") return null;
  const pending = raw as MpSyncPending & { ca_recent_done?: boolean };
  if (pending.ca_recent_done !== undefined) {
    delete pending.ca_recent_done;
  }
  return pending;
}

async function saveMpSyncPending(
  supabase: ReturnType<typeof createServiceClient>,
  scope: Exclude<SyncScope, "all">,
  pending: MpSyncPending | null
) {
  const pendingCol = scope === "compra_agil" ? "mp_sync_pending_ca" : "mp_sync_pending_lic";
  const payload: Record<string, unknown> = {
    [pendingCol]: pending,
    updated_at: new Date().toISOString(),
  };
  if (!pending) {
    payload.mp_sync_pending = null;
  }

  const { error } = await supabase
    .from("org_settings")
    .update(payload)
    .eq("organization_id", DEFAULT_ORG_ID);

  if (error) {
    if (/mp_sync_pending/i.test(error.message)) {
      throw new Error(
        "Falta migración de sync en Supabase (20260316700000_mp_sync_pending.sql y 20260316900000_dual_sync_metadata.sql)."
      );
    }
    throw new Error(error.message);
  }
}

async function filterCandidatesNeedingSync(
  supabase: ReturnType<typeof createServiceClient>,
  candidates: MpSyncPending["candidates"],
  options: { light?: boolean } = {}
): Promise<MpSyncPending["candidates"]> {
  if (candidates.length === 0) return candidates;

  const codes = candidates.map((c) => c.codigo_externo);
  const { data: rows } = await supabase
    .from("processes")
    .select(
      "id, codigo_externo, last_synced_at, hora_publicacion, hora_cierre, tipo, estado, adjudicado_a_mi, adjudicado_rut, fecha_cierre, dashboard_archived_at"
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .in("codigo_externo", codes);

  const processIds = (rows ?? []).map((r) => r.id as string);
  const { data: pipelineRows } =
    processIds.length > 0
      ? await supabase
          .from("kanban_cards")
          .select("process_id")
          .eq("organization_id", DEFAULT_ORG_ID)
          .eq("en_pipeline", true)
          .in("process_id", processIds)
      : { data: [] };

  const pipelineIds = new Set((pipelineRows ?? []).map((r) => r.process_id as string));

  const byCode = new Map(
    (rows ?? []).map((r) => [
      r.codigo_externo,
      {
        id: r.id as string,
        last_synced_at: r.last_synced_at as string | null,
        hora_publicacion: r.hora_publicacion as string | null,
        hora_cierre: r.hora_cierre as string | null,
        tipo: r.tipo as ProcessTipo,
        estado: r.estado as string | null,
        adjudicado_a_mi: r.adjudicado_a_mi as boolean,
        adjudicado_rut: r.adjudicado_rut as string | null,
        fecha_cierre: r.fecha_cierre as string | null,
        dashboard_archived_at: r.dashboard_archived_at as string | null,
      },
    ])
  );

  return candidates.filter((c) => {
    const row = byCode.get(c.codigo_externo);
    if (!row) return true;

    if (row.dashboard_archived_at) return false;

    return processNeedsApiRefresh({
      estado: row.estado,
      adjudicado_a_mi: row.adjudicado_a_mi,
      adjudicado_rut: row.adjudicado_rut,
      tipo: c.tipo ?? row.tipo,
      fecha_cierre: row.fecha_cierre,
      last_synced_at: row.last_synced_at ?? undefined,
      hora_publicacion: row.hora_publicacion,
      hora_cierre: row.hora_cierre,
      en_pipeline: pipelineIds.has(row.id),
    });
  });
}

function prioritizeSyncCandidates(_pending: MpSyncPending) {
  /* colas ya separadas por scope */
}

async function discoverSyncCandidates(
  ticket: string,
  notifyFilters: Awaited<ReturnType<typeof loadOrgContentFilters>>,
  lastSyncAt: string | null,
  onError: (msg: string) => void
): Promise<{ pending: MpSyncPending; dates: string[]; mode: "initial" | "incremental" }> {
  const { dates, mode, light } = buildSyncDateRange(lastSyncAt);
  const licitacionesList = await fetchLicitacionesForDates(ticket, dates, onError);

  const candidates = licitacionesList.filter((p) =>
    passesLicitacionDiscoverFilter(p, notifyFilters)
  );

  const seen = new Set<string>();
  let unique: MpSyncPending["candidates"] = [];
  for (const process of candidates) {
    if (seen.has(process.codigo_externo)) continue;
    if (unique.length >= MP_LICITACION_CANDIDATE_MAX) break;
    seen.add(process.codigo_externo);
    unique.push({
      codigo_externo: process.codigo_externo,
      tipo: process.tipo,
      nombre: process.nombre,
    });
  }

  const supabase = createServiceClient();
  unique = await filterCandidatesNeedingSync(supabase, unique, { light });

  return {
    dates,
    mode,
    pending: {
      candidates: unique,
      index: 0,
      mode,
      daysQueried: dates.length,
      fetched: unique.length,
      created: 0,
      updated: 0,
      errors: [],
      ca_fetched: false,
      ca_term_offset: 0,
      light,
    },
  };
}

async function appendCompraAgilCandidates(
  ticket: string,
  pending: MpSyncPending,
  notifyFilters: Awaited<ReturnType<typeof loadOrgContentFilters>>,
  onError: (msg: string) => void,
  lastSyncAt: string | null,
  options?: { perRequest?: boolean }
) {
  const beforeLen = pending.candidates.length;
  const seen = new Set(pending.candidates.map((c) => c.codigo_externo));
  const discoverMode = pending.ca_discover_mode ?? "incremental";
  const publicadoDesde =
    pending.ca_publicado_desde ?? compraAgilPublicadoDesdeIso(lastSyncAt, discoverMode);
  pending.ca_publicado_desde = publicadoDesde;

  if (!pending.ca_search_terms?.length) {
    pending.ca_search_terms = buildCompraAgilSearchTerms(
      notifyFilters.keywords,
      notifyFilters.rubros
    );
    pending.ca_term_offset = pending.ca_term_offset ?? 0;
  }

  const terms = pending.ca_search_terms;
  const offset = pending.ca_term_offset ?? 0;
  const keywordBatchSize = options?.perRequest
    ? 4
    : pending.cron_run
      ? CRON_CA_KEYWORDS_PER_BATCH
      : MP_CA_KEYWORDS_PER_BATCH;

  if (pending.cron_run && discoverMode === "nightly") {
    pending.ca_keywords_skipped = false;
  }

  if (!pending.ca_keywords_skipped && offset < terms.length) {
    try {
      const batch = await fetchCompraAgilForTerms(
        ticket,
        terms,
        MP_CA_PAGES_PER_KEYWORD,
        {
          startIndex: offset,
          batchSize: keywordBatchSize,
          publicadoDesde,
        }
      );
      for (const normalized of batch) {
        if (countCandidatesByTipo(pending, "compra_agil") >= MP_CA_CANDIDATE_MAX) break;
        if (pending.cron_run && countCandidatesByTipo(pending, "compra_agil") >= CRON_CA_CANDIDATE_CAP) {
          break;
        }
        if (!passesCaDiscoverFilter(normalized, notifyFilters)) continue;
        appendCaCandidate(pending, normalized, seen);
      }
    } catch (err) {
      onError(`Compra ágil (keywords): ${err instanceof Error ? err.message : "Error"}`);
    }

    pending.ca_term_offset = offset + keywordBatchSize;
    if (pending.cron_run && (pending.ca_term_offset ?? 0) >= 16) {
      pending.ca_term_offset = terms.length;
      pending.ca_keywords_skipped = true;
    }
  } else if (pending.ca_keywords_skipped && offset < terms.length) {
    pending.ca_term_offset = terms.length;
  }

  const ranKeywordBatch = !pending.ca_keywords_skipped && offset < terms.length;

  if ((pending.ca_term_offset ?? 0) >= terms.length && !pending.ca_recent_scanned) {
    const deferListing = options?.perRequest && ranKeywordBatch;
    if (!deferListing) {
      try {
        const maxPages = pending.cron_run ? 4 : options?.perRequest ? 2 : 3;
        const rawItems = await fetchCompraAgilPublishedSince(ticket, publicadoDesde, maxPages);
        for (const raw of rawItems) {
          if (countCandidatesByTipo(pending, "compra_agil") >= MP_CA_CANDIDATE_MAX) break;
          const normalized = normalizeCompraAgil(raw);
          if (!passesCaDiscoverFilter(normalized, notifyFilters)) continue;
          appendCaCandidate(pending, normalized, seen);
        }
      } catch (err) {
        onError(`Compra ágil (listado reciente): ${err instanceof Error ? err.message : "Error"}`);
      }
      pending.ca_recent_scanned = true;
    }
  }

  if ((pending.ca_term_offset ?? 0) >= terms.length && pending.ca_recent_scanned) {
    pending.ca_fetched = true;
  }

  const supabase = createServiceClient();
  const added = pending.candidates.slice(beforeLen);
  const filteredAdded = await filterCandidatesNeedingSync(supabase, added, {
    light: pending.light,
  });
  pending.candidates = [...pending.candidates.slice(0, beforeLen), ...filteredAdded];
  pending.fetched = pending.candidates.length;
}

async function finalizeDashboardSync(
  supabase: ReturnType<typeof createServiceClient>,
  pending: MpSyncPending,
  notifyFilters: Awaited<ReturnType<typeof loadOrgContentFilters>>,
  scope: Exclude<SyncScope, "all">,
  options?: { fast?: boolean; preArchived?: number }
): Promise<DashboardSyncBatchResult> {
  const archived = options?.fast
    ? (options.preArchived ?? 0)
    : (await archiveStaleDashboardProcesses().catch(() => ({ archived: 0 }))).archived;

  const incompleteLimit = options?.fast ? 5 : pending.candidates.length === 0 ? 15 : 20;
  const staleLimit = options?.fast ? 3 : pending.cron_run ? 8 : 12;

  if (pending.candidates.length === 0) {
    const incomplete = await refreshIncompleteProcesses(incompleteLimit, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch(() => ({ refreshed: 0, errors: [] }));
    pending.updated += incomplete.refreshed;
  } else if (!options?.fast) {
    const incomplete = await refreshIncompleteProcesses(incompleteLimit, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch((err) => {
      pending.errors.push(`Completar fechas: ${err instanceof Error ? err.message : "Error"}`);
      return { refreshed: 0, errors: [] };
    });
    pending.updated += incomplete.refreshed;
    pending.errors.push(...incomplete.errors.slice(0, 2));

    const stale = await refreshStaleProcesses(staleLimit, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch((err) => {
      pending.errors.push(`Refresh estados: ${err instanceof Error ? err.message : "Error"}`);
      return { refreshed: 0, notFound: 0, errors: [] };
    });
    pending.updated += stale.refreshed;
    pending.errors.push(...stale.errors.slice(0, 3));
  } else {
    const incomplete = await refreshIncompleteProcesses(incompleteLimit, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch(() => ({ refreshed: 0, errors: [] }));
    pending.updated += incomplete.refreshed;
  }

  pending.finalized = true;
  await updateLastMpSyncAt(supabase, scope, pending.cron_run ? "cron" : "manual");
  await saveMpSyncPending(supabase, scope, null);

  const result = buildBatchResult(pending, true, "finalize");
  result.summary.archived = archived;
  return result;
}

function isRecentScopeSync(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return false;
  const hours = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  return hours < MP_SYNC_COOLDOWN_HOURS;
}

async function initCaSyncPending(
  supabase: ReturnType<typeof createServiceClient>,
  options?: { cron?: boolean }
): Promise<MpSyncPending> {
  const lastSyncAt = await getLastMpSyncAt(supabase, "compra_agil");
  const light = isRecentScopeSync(lastSyncAt) && !options?.cron;
  const discoverMode: CaDiscoverMode = !lastSyncAt
    ? "initial"
    : options?.cron
      ? "nightly"
      : "incremental";

  return {
    candidates: [],
    index: 0,
    mode: lastSyncAt ? "incremental" : "initial",
    daysQueried: Math.ceil(MP_INITIAL_SYNC_HOURS / 24),
    fetched: 0,
    created: 0,
    updated: 0,
    errors: [],
    ca_fetched: false,
    ca_term_offset: 0,
    ca_discover_mode: discoverMode,
    ca_publicado_desde: compraAgilPublicadoDesdeIso(lastSyncAt, discoverMode),
    cron_run: options?.cron ?? false,
    ca_keywords_skipped: false,
    light,
  };
}

export interface DashboardSyncBatchOptions {
  continueBatch?: boolean;
  scope: Exclude<SyncScope, "all">;
  cron?: boolean;
  /** Usa presupuesto largo (servidor) en lugar de lote corto (navegador). */
  serverSide?: boolean;
  /** Tope de ms por lote dentro de una request (evita timeout Vercel 300 s). */
  maxBatchMs?: number;
}

/** Máx. ms por request HTTP de sync manual (Vercel corta ~300 s; el cliente encadena rondas). */
const MANUAL_SYNC_PER_REQUEST_MS = 52_000;
const MANUAL_SYNC_BUDGET_MS = 240_000;
const MANUAL_CANDIDATE_CAP = 50;

/**
 * Una ronda de sync manual (~50 s). El botón encadena varias rondas hasta terminar o pausar.
 * Reutiliza cola mp_sync_pending: si se corta, la siguiente ronda retoma.
 */
export async function runFastManualSync(
  scope: Exclude<SyncScope, "all">,
  options?: { continueBatch?: boolean }
): Promise<DashboardSyncBatchResult> {
  const { supabase, ticket } = await getOrgContext();
  if (!ticket) throw new Error("Configura el ticket de ChileCompra en Ajustes");

  let continueBatch = options?.continueBatch ?? false;

  if (!continueBatch) {
    const existing = await loadMpSyncPending(supabase, scope);
    if (existing && !existing.finalized) {
      continueBatch = true;
    }
  }

  const result = await runDashboardSyncBatch({
    continueBatch,
    scope,
    cron: false,
    serverSide: true,
    maxBatchMs: MANUAL_SYNC_PER_REQUEST_MS,
  });

  if (result.done) return result;
  return { ...result, done: false, partial: true };
}

/** Un lote de sincronización (≈30–50 s navegador / ≈260 s servidor). */
export async function runDashboardSyncBatch(
  options: DashboardSyncBatchOptions
): Promise<DashboardSyncBatchResult> {
  const { continueBatch = false, scope, cron = false, serverSide = false } = options;
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) throw new Error("Configura el ticket de ChileCompra en Ajustes");

  const notifyFilters = await loadOrgContentFilters();
  let pending = continueBatch ? await loadMpSyncPending(supabase, scope) : null;

  if (pending && pending.ca_fetched === undefined) {
    pending.ca_fetched = scope === "licitacion";
  }

  if (
    pending &&
    pending.ca_fetched &&
    pending.index >= pending.candidates.length &&
    !pending.finalized
  ) {
    return finalizeDashboardSync(supabase, pending, notifyFilters, scope);
  }

  if (!pending) {
    await closeStaleSyncRuns(supabase);
    if (!continueBatch) {
      await saveMpSyncPending(supabase, scope, null);
      await archiveStaleDashboardProcesses().catch(() => ({ archived: 0 }));
    }
    if (scope === "compra_agil") {
      pending = await initCaSyncPending(supabase, { cron });
    } else {
      const lastSyncAt = await getLastMpSyncAt(supabase, "licitacion");
      const discoverErrors: string[] = [];
      const discovered = await discoverSyncCandidates(
        ticket,
        notifyFilters,
        lastSyncAt,
        (msg) => discoverErrors.push(msg)
      );
      pending = discovered.pending;
      pending.ca_fetched = true;
      pending.cron_run = cron;
      pending.errors = discoverErrors;
    }
    await saveMpSyncPending(supabase, scope, pending);
    return buildBatchResult(pending, false, scope === "compra_agil" ? "compra_agil" : "discover");
  }

  if (scope === "compra_agil" && !pending.ca_fetched) {
    const lastSyncAt = await getLastMpSyncAt(supabase, "compra_agil");
    await appendCompraAgilCandidates(
      ticket,
      pending,
      notifyFilters,
      (msg) => pending!.errors.push(msg),
      lastSyncAt,
      { perRequest: Boolean(options.maxBatchMs && options.maxBatchMs <= 60_000) }
    );
    await saveMpSyncPending(supabase, scope, pending);
    return buildBatchResult(pending, false, "compra_agil");
  }

  const batchBudgetMs =
    options.maxBatchMs ??
    (options.serverSide ? MANUAL_SYNC_BUDGET_MS : SYNC_BATCH_BUDGET_MS);
  const batchSize = options.serverSide ? MANUAL_CANDIDATE_CAP : SYNC_BATCH_SIZE;

  const batchStarted = Date.now();
  const endIndex = Math.min(pending.index + batchSize, pending.candidates.length);

  for (let i = pending.index; i < endIndex; i += 1) {
    if (Date.now() - batchStarted > batchBudgetMs - 6_000) break;

    const candidate = pending.candidates[i];
    try {
      const detailed = await enrichWithFullDetail(
        ticket,
        candidate.codigo_externo,
        candidate.tipo
      );
      if (!detailed) {
        pending.errors.push(`${candidate.codigo_externo}: no encontrado en MP`);
      } else if (passesPostEnrichFilter(detailed, notifyFilters)) {
        const result = await upsertProcess(supabase, detailed, orgRut, {
          notifyFilters,
          markDashboardSync: true,
        });
        if (result === "created") pending.created += 1;
        else pending.updated += 1;
      }
      await delay(120);
    } catch (err) {
      pending.errors.push(formatSyncProcessError(candidate.codigo_externo, err));
    }
    pending.index = i + 1;
  }

  const allEnriched = pending.index >= pending.candidates.length;

  if (allEnriched) {
    await saveMpSyncPending(supabase, scope, pending);
    return buildBatchResult(pending, false, "enrich");
  }

  await saveMpSyncPending(supabase, scope, pending);
  return buildBatchResult(pending, false, "enrich");
}

/** Cron / uso interno legado: ejecuta CA + licitaciones seguidos (puede exceder timeout). */
export async function runDashboardSync(): Promise<IngestSummary & { archived?: number }> {
  return runDashboardSyncCron({ maxMs: 275_000 });
}

export async function recordCronAttempt(): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("org_settings")
    .update({
      last_cron_attempt_at: new Date().toISOString(),
      last_cron_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", DEFAULT_ORG_ID);
}

export async function recordCronFailure(message: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("org_settings")
    .update({
      last_cron_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", DEFAULT_ORG_ID);
}

/**
 * Sync nocturna con presupuesto de tiempo: retoma colas pendientes y avanza CA + licitaciones
 * dentro del límite de Vercel (≈275 s) sin bloquear hasta completar todo en una sola noche.
 */
export async function runDashboardSyncCron(options?: {
  maxMs?: number;
}): Promise<IngestSummary & { archived?: number; partial?: boolean }> {
  const maxMs = options?.maxMs ?? 275_000;
  const deadline = Date.now() + maxMs;
  const supabase = createServiceClient();

  const { archived: archivedAtStart } = await archiveStaleDashboardProcesses().catch(() => ({
    archived: 0,
  }));

  const summaries: Partial<Record<Exclude<SyncScope, "all">, IngestSummary>> = {};
  let partial = false;
  const scopesTouched = new Set<Exclude<SyncScope, "all">>();

  for (const scope of ["compra_agil", "licitacion"] as const) {
    if (Date.now() >= deadline) {
      partial = true;
      break;
    }

    const existing = await loadMpSyncPending(supabase, scope);
    if (existing && !existing.finalized) {
      await preparePendingForCron(supabase, scope, existing);
    }

    let continueBatch = Boolean(existing && !existing.finalized);

    while (Date.now() < deadline) {
      const result = await runDashboardSyncBatch({ continueBatch, scope, cron: true });
      continueBatch = true;
      scopesTouched.add(scope);
      if (result.summary.created > 0 || result.summary.updated > 0 || result.done) {
        await touchCronSyncTimestamp(scope).catch(() => undefined);
      }
      if (result.done) {
        summaries[scope] = result.summary;
        break;
      }
      partial = true;
    }

    if (!summaries[scope]) {
      partial = true;
      const pending = await loadMpSyncPending(supabase, scope);
      if (pending && !pending.finalized && pending.index > 0) {
        await preparePendingForCron(supabase, scope, pending);
      }
    }
  }

  if (scopesTouched.size > 0) {
    for (const scope of scopesTouched) {
      await touchCronSyncTimestamp(scope).catch(() => undefined);
    }
  }

  const { archived: archivedAtEnd } = await archiveStaleDashboardProcesses().catch(() => ({
    archived: 0,
  }));
  const archived = archivedAtStart + archivedAtEnd;

  const ca = summaries.compra_agil;
  const lic = summaries.licitacion;
  const summary: IngestSummary & { archived?: number; partial?: boolean } = {
    fetched: (ca?.fetched ?? 0) + (lic?.fetched ?? 0),
    created: (ca?.created ?? 0) + (lic?.created ?? 0),
    updated: (ca?.updated ?? 0) + (lic?.updated ?? 0),
    evaluatedIa: 0,
    errors: [...(ca?.errors ?? []), ...(lic?.errors ?? [])].slice(0, 20),
    mode: lic?.mode ?? ca?.mode,
    daysQueried: lic?.daysQueried ?? ca?.daysQueried,
    archived,
    partial,
  };

  await supabase
    .from("org_settings")
    .update({
      last_cron_summary: {
        partial,
        fetched: summary.fetched,
        created: summary.created,
        updated: summary.updated,
        archived,
        at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", DEFAULT_ORG_ID);

  return summary;
}

async function getLastMpSyncAt(
  supabase: ReturnType<typeof createServiceClient>,
  scope: Exclude<SyncScope, "all">
): Promise<string | null> {
  const col = scope === "compra_agil" ? "last_mp_sync_ca_at" : "last_mp_sync_lic_at";
  const { data } = await supabase
    .from("org_settings")
    .select(`${col}, last_mp_sync_at`)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  const row = data as Record<string, string | null> | null;
  return row?.[col] ?? row?.last_mp_sync_at ?? null;
}

export async function runBackfillIngestion(daysBack = 45): Promise<IngestSummary> {
  const summary: IngestSummary = {
    fetched: 0,
    created: 0,
    updated: 0,
    evaluatedIa: 0,
    errors: [],
  };

  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) throw new Error("Configura el ticket de ChileCompra en org_settings");

  await closeStaleSyncRuns(supabase);
  const notifyFilters = await loadOrgContentFilters();

  const today = new Date();
  const dates = Array.from({ length: daysBack }, (_, offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return formatApiDateChile(d);
  });

  const { data: syncRun } = await supabase
    .from("sync_runs")
    .insert({ organization_id: DEFAULT_ORG_ID, status: "running" })
    .select("id")
    .single();

  try {
    const licitaciones = await fetchLicitacionesForDates(ticket, dates, (msg) =>
      summary.errors.push(msg)
    );
    const comprasAgil = await fetchAllCompraAgilForBackfill(
      ticket,
      notifyFilters.keywords,
      notifyFilters.rubros,
      (msg) => summary.errors.push(msg)
    );

    const allProcesses = [...licitaciones, ...comprasAgil];
    summary.fetched = allProcesses.length;

    const seen = new Set<string>();
    for (const process of allProcesses) {
      if (seen.has(process.codigo_externo)) continue;
      seen.add(process.codigo_externo);
      try {
        const result = await upsertProcess(supabase, process, orgRut, { notifyFilters });
        if (result === "created") summary.created += 1;
        else summary.updated += 1;
      } catch (err) {
        summary.errors.push(
          `${process.codigo_externo}: ${err instanceof Error ? err.message : "Error desconocido"}`
        );
      }
    }

    const stale = await refreshStaleProcesses(80, notifyFilters).catch((err) => {
      summary.errors.push(`Refresh estados: ${err instanceof Error ? err.message : "Error"}`);
      return { refreshed: 0, notFound: 0, errors: [] };
    });
    summary.updated += stale.refreshed;
    summary.errors.push(...stale.errors.slice(0, 10));

    await supabase
      .from("sync_runs")
      .update({
        status: summary.errors.length ? "partial" : "success",
        processes_fetched: summary.fetched,
        processes_created: summary.created,
        processes_updated: summary.updated,
        processes_evaluated_ia: summary.evaluatedIa,
        errors: summary.errors.slice(0, 50),
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun?.id);

    return summary;
  } catch (err) {
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        errors: [err instanceof Error ? err.message : "Error desconocido"],
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun?.id);
    throw err;
  }
}

export async function refreshProcessByCodigo(
  ticket: string,
  codigo: string,
  tipo: ProcessTipo
): Promise<NormalizedProcess | null> {
  if (tipo === "licitacion") {
    const raw = await fetchLicitacionByCodigo(ticket, codigo);
    return raw ? normalizeLicitacion(raw) : null;
  }
  const raw = await fetchCompraAgilByCodigo(ticket, codigo);
  return raw ? normalizeCompraAgil(raw) : null;
}

/** Refresca un proceso desde la API de ChileCompra y lo guarda en la base. */
export async function refreshProcessInDb(
  codigo: string
): Promise<"updated" | "not_found"> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  const trimmed = codigo.trim();
  const { data: existing } = await supabase
    .from("processes")
    .select("tipo")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("codigo_externo", trimmed)
    .maybeSingle();

  const tipo: ProcessTipo = existing?.tipo ?? inferProcessTipo(trimmed);
  const normalized = await refreshProcessByCodigo(ticket, trimmed, tipo);
  if (!normalized) return "not_found";

  await upsertProcess(supabase, normalized, orgRut, {
    notifyFilters: await loadOrgContentFilters(),
    markDashboardSync: true,
  });
  return "updated";
}

const REFRESH_CONCURRENCY = 4;

async function refreshProcessRowsInParallel(
  rows: Array<{ codigo_externo: string; tipo: ProcessTipo }>,
  options: {
    ticket: string;
    supabase: ReturnType<typeof createServiceClient>;
    orgRut: string | null;
    notifyFilters: Awaited<ReturnType<typeof loadOrgContentFilters>>;
    upsertOptions: Parameters<typeof upsertProcess>[3];
  }
): Promise<{ updated: number; notFound: number; errors: string[] }> {
  let updated = 0;
  let notFound = 0;
  const errors: string[] = [];

  async function refreshOne(row: { codigo_externo: string; tipo: ProcessTipo }) {
    try {
      const normalized = await refreshProcessByCodigo(
        options.ticket,
        row.codigo_externo,
        row.tipo
      );
      if (!normalized) {
        notFound += 1;
        return;
      }
      await upsertProcess(options.supabase, normalized, options.orgRut, {
        notifyFilters: options.notifyFilters,
        ...options.upsertOptions,
      });
      updated += 1;
    } catch (err) {
      errors.push(
        `${row.codigo_externo}: ${err instanceof Error ? err.message : "Error desconocido"}`
      );
    }
  }

  for (let i = 0; i < rows.length; i += REFRESH_CONCURRENCY) {
    const chunk = rows.slice(i, i + REFRESH_CONCURRENCY);
    await Promise.all(chunk.map((row) => refreshOne(row)));
    if (i + REFRESH_CONCURRENCY < rows.length) {
      await delay(200);
    }
  }

  return { updated, notFound, errors };
}

/** Actualiza procesos descartados (archivados) bajo demanda — no corre en sync CA/Licitaciones. */
export async function refreshDiscardedProcesses(
  processIds: string[]
): Promise<{ updated: number; notFound: number; errors: string[] }> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  const uniqueIds = [...new Set(processIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { updated: 0, notFound: 0, errors: [] };
  }

  const { data: rows, error } = await supabase
    .from("processes")
    .select("id, codigo_externo, tipo")
    .eq("organization_id", DEFAULT_ORG_ID)
    .not("dashboard_archived_at", "is", null)
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);

  const notifyFilters = await loadOrgContentFilters();
  const { updated, notFound, errors } = await refreshProcessRowsInParallel(
    (rows ?? []).map((row) => ({
      codigo_externo: row.codigo_externo,
      tipo: row.tipo as ProcessTipo,
    })),
    {
      ticket,
      supabase,
      orgRut,
      notifyFilters,
      upsertOptions: { forceRefresh: true },
    }
  );

  return { updated, notFound, errors };
}

/** Actualiza procesos activos del dashboard por código (página o selección). */
export async function refreshDashboardProcesses(
  processIds: string[]
): Promise<{ updated: number; notFound: number; skipped: number; errors: string[] }> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  const uniqueIds = [...new Set(processIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { updated: 0, notFound: 0, skipped: 0, errors: [] };
  }

  const { data: rows, error } = await supabase
    .from("processes")
    .select("id, codigo_externo, tipo")
    .eq("organization_id", DEFAULT_ORG_ID)
    .is("dashboard_archived_at", null)
    .eq("synced_via_dashboard", true)
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);

  const foundIds = new Set((rows ?? []).map((r) => r.id as string));
  const skipped = uniqueIds.filter((id) => !foundIds.has(id)).length;

  const notifyFilters = await loadOrgContentFilters();
  const { updated, notFound, errors } = await refreshProcessRowsInParallel(
    (rows ?? []).map((row) => ({
      codigo_externo: row.codigo_externo,
      tipo: row.tipo as ProcessTipo,
    })),
    {
      ticket,
      supabase,
      orgRut,
      notifyFilters,
      upsertOptions: { markDashboardSync: true },
    }
  );

  return { updated, notFound, skipped, errors };
}

/** Vuelve a pedir detalle MP cuando faltan fechas (listado diario o normalización antigua). */
export async function refreshIncompleteProcesses(
  limit = 20,
  filtersArg?: Awaited<ReturnType<typeof loadOrgContentFilters>>,
  upsertOptions?: {
    markDashboardSync?: boolean;
    notifyFilters?: Awaited<ReturnType<typeof loadOrgContentFilters>>;
  }
): Promise<{ refreshed: number; errors: string[] }> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  const filters = filtersArg ?? (await loadOrgContentFilters());
  const notifyFilters = upsertOptions?.notifyFilters ?? filters;

  const { data: incomplete } = await supabase
    .from("processes")
    .select("id, codigo_externo, tipo, nombre, servicios_requeridos, adjudicado_a_mi")
    .eq("organization_id", DEFAULT_ORG_ID)
    .is("dashboard_archived_at", null)
    .or(
      "fecha_publicacion.is.null,fecha_cierre.is.null,hora_publicacion.is.null,hora_cierre.is.null"
    )
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit * 4);

  let refreshed = 0;
  const errors: string[] = [];

  for (const row of incomplete ?? []) {
    if (refreshed >= limit) break;
    if (!isProcessRelevant(row, filters)) continue;

    try {
      const normalized = await refreshProcessByCodigo(ticket, row.codigo_externo, row.tipo);
      if (!normalized) continue;
      await upsertProcess(supabase, normalized, orgRut, {
        notifyFilters,
        markDashboardSync: upsertOptions?.markDashboardSync,
      });
      refreshed += 1;
      await delay(400);
    } catch (err) {
      errors.push(
        `${row.codigo_externo}: ${err instanceof Error ? err.message : "Error"}`
      );
    }
  }

  return { refreshed, errors };
}

/** Refresca procesos relevantes vencidos que aún figuran como publicados. */
export async function refreshStaleProcesses(
  limit = 50,
  filtersArg?: Awaited<ReturnType<typeof loadOrgContentFilters>>,
  upsertOptions?: {
    markDashboardSync?: boolean;
    notifyFilters?: Awaited<ReturnType<typeof loadOrgContentFilters>>;
  }
): Promise<{
  refreshed: number;
  notFound: number;
  errors: string[];
}> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  const filters = filtersArg ?? (await loadOrgContentFilters());
  const notifyFilters = filters;

  const { data: stale } = await supabase
    .from("processes")
    .select(
      "id, codigo_externo, tipo, nombre, servicios_requeridos, adjudicado_a_mi, estado, fecha_cierre, hora_cierre"
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .is("dashboard_archived_at", null)
    .lte("fecha_cierre", new Date().toISOString())
    .or("estado.ilike.%publicad%,estado.is.null")
    .order("fecha_cierre", { ascending: false })
    .limit(limit * 4);

  const staleIds = (stale ?? []).map((r) => r.id as string);
  const pipelineIds =
    staleIds.length > 0
      ? await supabase
          .from("kanban_cards")
          .select("process_id")
          .eq("organization_id", DEFAULT_ORG_ID)
          .eq("en_pipeline", true)
          .in("process_id", staleIds)
          .then(({ data }) => new Set((data ?? []).map((r) => r.process_id as string)))
      : new Set<string>();

  let refreshed = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const row of stale ?? []) {
    if (refreshed >= limit) break;
    if (!isPastCierre(row.fecha_cierre as string | null, row.hora_cierre as string | null)) {
      continue;
    }
    if (!pipelineIds.has(row.id as string) && !row.adjudicado_a_mi) {
      continue;
    }
    if (!isProcessRelevant(row, filters)) continue;

    try {
      const normalized = await refreshProcessByCodigo(ticket, row.codigo_externo, row.tipo);
      if (!normalized) {
        notFound += 1;
        continue;
      }
      await upsertProcess(supabase, normalized, orgRut, {
        notifyFilters: upsertOptions?.notifyFilters ?? notifyFilters,
        markDashboardSync: upsertOptions?.markDashboardSync,
      });
      refreshed += 1;
    } catch (err) {
      errors.push(
        `${row.codigo_externo}: ${err instanceof Error ? err.message : "Error desconocido"}`
      );
    }
  }

  return { refreshed, notFound, errors };
}

function estadoLooksStale(estado: string | null | undefined): boolean {
  if (!estado) return true;
  return /publicad/i.test(estado);
}

const KANBAN_REFRESH_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function kanbanPipelineNeedsRefresh(row: {
  estado: string | null;
  fecha_cierre: string | null;
  hora_cierre: string | null;
  adjudicado_a_mi: boolean;
  last_synced_at: string | null;
}): boolean {
  if (
    isPastCierre(row.fecha_cierre, row.hora_cierre) &&
    !row.adjudicado_a_mi &&
    !isTerminalMpEstado(row.estado)
  ) {
    return true;
  }
  if (!row.last_synced_at) return true;
  return Date.now() - new Date(row.last_synced_at).getTime() > KANBAN_REFRESH_MAX_AGE_MS;
}

/** Actualiza estados MP de procesos en el Kanban (prioriza cierre vencido). */
export async function refreshKanbanPipelineProcesses(limit = 25): Promise<{
  refreshed: number;
  notFound: number;
  errors: string[];
}> {
  const { supabase, orgRut, ticket } = await getOrgContext();
  if (!ticket) {
    return { refreshed: 0, notFound: 0, errors: [] };
  }

  const { data: cardRows, error } = await supabase
    .from("kanban_cards")
    .select(
      `
      process_id,
      processes (
        codigo_externo,
        tipo,
        estado,
        fecha_cierre,
        hora_cierre,
        adjudicado_a_mi,
        last_synced_at
      )
    `
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("en_pipeline", true)
    .eq("descartado", false);

  if (error) throw new Error(error.message);

  type PipelineRow = {
    codigo_externo: string;
    tipo: ProcessTipo;
    estado: string | null;
    fecha_cierre: string | null;
    hora_cierre: string | null;
    adjudicado_a_mi: boolean;
    last_synced_at: string | null;
  };

  const candidates = (cardRows ?? [])
    .map((row) => {
      const process = row.processes as PipelineRow | PipelineRow[] | null;
      const p = Array.isArray(process) ? process[0] : process;
      if (!p?.codigo_externo) return null;
      return p;
    })
    .filter((p): p is PipelineRow => p !== null && kanbanPipelineNeedsRefresh(p))
    .sort((a, b) => {
      const aPast = isPastCierre(a.fecha_cierre, a.hora_cierre) ? 0 : 1;
      const bPast = isPastCierre(b.fecha_cierre, b.hora_cierre) ? 0 : 1;
      if (aPast !== bPast) return aPast - bPast;
      const aSync = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
      const bSync = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
      return aSync - bSync;
    })
    .slice(0, limit)
    .map((p) => ({ codigo_externo: p.codigo_externo, tipo: p.tipo }));

  if (candidates.length === 0) {
    return { refreshed: 0, notFound: 0, errors: [] };
  }

  const notifyFilters = await loadOrgContentFilters();
  const { updated, notFound, errors } = await refreshProcessRowsInParallel(candidates, {
    ticket,
    supabase,
    orgRut,
    notifyFilters,
    upsertOptions: { markDashboardSync: true },
  });

  return { refreshed: updated, notFound, errors };
}

export async function maybeRefreshSearchProcess(q?: string): Promise<void> {
  if (!q || !looksLikeProcessCodigo(q)) return;

  const trimmed = q.trim();
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("processes")
    .select("estado, adjudicado_a_mi, last_synced_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("codigo_externo", trimmed)
    .maybeSingle();

  if (existing) {
    const recentlySynced =
      existing.last_synced_at &&
      Date.now() - new Date(existing.last_synced_at).getTime() < 15 * 60 * 1000;

    if (recentlySynced) return;

    const staleEstado = estadoLooksStale(existing.estado);
    const missingAdjudicacionFlag = !existing.adjudicado_a_mi && !staleEstado;

    if (!staleEstado && !missingAdjudicacionFlag) return;
  }

  await refreshProcessInDb(trimmed).catch(() => undefined);
}

export async function runIngestion(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    fetched: 0,
    created: 0,
    updated: 0,
    evaluatedIa: 0,
    errors: [],
  };

  const { supabase, orgRut, ticket } = await getOrgContext();

  if (!ticket) {
    throw new Error("Configura el ticket de ChileCompra en org_settings");
  }

  await closeStaleSyncRuns(supabase);
  const notifyFilters = await loadOrgContentFilters();

  const { data: syncRun } = await supabase
    .from("sync_runs")
    .insert({ organization_id: DEFAULT_ORG_ID, status: "running" })
    .select("id")
    .single();

  try {
    const processes = await fetchDailyProcessesWithCompraAgil(
      ticket,
      notifyFilters.keywords,
      notifyFilters.rubros
    );
    summary.fetched = processes.length;

    for (const process of processes) {
      try {
        const montoCheck = parseMontoFromApi(process.monto_raw_api);
        if (process.monto_estimado !== null && montoCheck.value !== null) {
          if (process.monto_estimado !== montoCheck.value) {
            summary.errors.push(
              `Monto inconsistente ${process.codigo_externo}: db=${process.monto_estimado} api=${montoCheck.value}`
            );
          }
        }

        const result = await upsertProcess(supabase, process, orgRut, { notifyFilters });
        if (result === "created") summary.created += 1;
        else summary.updated += 1;
      } catch (err) {
        summary.errors.push(
          `${process.codigo_externo}: ${err instanceof Error ? err.message : "Error desconocido"}`
        );
      }
    }

    await supabase
      .from("sync_runs")
      .update({
        status: summary.errors.length ? "partial" : "success",
        processes_fetched: summary.fetched,
        processes_created: summary.created,
        processes_updated: summary.updated,
        processes_evaluated_ia: summary.evaluatedIa,
        errors: summary.errors,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun?.id);

    return summary;
  } catch (err) {
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        errors: [err instanceof Error ? err.message : "Error desconocido"],
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun?.id);
    throw err;
  }
}
