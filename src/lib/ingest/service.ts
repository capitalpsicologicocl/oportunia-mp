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
import { processNeedsApiRefresh, type SyncScope } from "@/lib/ingest/sync-refresh";
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

  if (mode === "initial" || mode === "nightly") {
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

const SYNC_BATCH_SIZE = 6;
/** Tiempo máximo por request HTTP (~50 s) para evitar timeout del navegador. */
const SYNC_BATCH_BUDGET_MS = 50_000;

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
  lastSyncAt: string | null
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

  if (offset < terms.length) {
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
      for (const normalized of batch) {
        if (countCandidatesByTipo(pending, "compra_agil") >= MP_CA_CANDIDATE_MAX) break;
        if (!passesCaDiscoverFilter(normalized, notifyFilters)) continue;
        appendCaCandidate(pending, normalized, seen);
      }
    } catch (err) {
      onError(`Compra ágil (keywords): ${err instanceof Error ? err.message : "Error"}`);
    }

    pending.ca_term_offset = offset + MP_CA_KEYWORDS_PER_BATCH;
  }

  if ((pending.ca_term_offset ?? 0) >= terms.length && !pending.ca_recent_scanned) {
    try {
      const maxPages = pending.cron_run ? 6 : 3;
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
  scope: Exclude<SyncScope, "all">
): Promise<DashboardSyncBatchResult> {
  if (pending.candidates.length === 0) {
    const incomplete = await refreshIncompleteProcesses(15, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch(() => ({ refreshed: 0, errors: [] }));
    pending.updated += incomplete.refreshed;
  } else {
    const incomplete = await refreshIncompleteProcesses(20, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch((err) => {
      pending.errors.push(`Completar fechas: ${err instanceof Error ? err.message : "Error"}`);
      return { refreshed: 0, errors: [] };
    });
    pending.updated += incomplete.refreshed;
    pending.errors.push(...incomplete.errors.slice(0, 2));

    const stale = await refreshStaleProcesses(25, notifyFilters, {
      markDashboardSync: true,
      notifyFilters,
    }).catch((err) => {
      pending.errors.push(`Refresh estados: ${err instanceof Error ? err.message : "Error"}`);
      return { refreshed: 0, notFound: 0, errors: [] };
    });
    pending.updated += stale.refreshed;
    pending.errors.push(...stale.errors.slice(0, 3));
  }

  pending.finalized = true;
  await updateLastMpSyncAt(supabase, scope, pending.cron_run ? "cron" : "manual");
  await saveMpSyncPending(supabase, scope, null);

  const { archived } = await archiveStaleDashboardProcesses().catch(() => ({ archived: 0 }));
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
    light,
  };
}

export interface DashboardSyncBatchOptions {
  continueBatch?: boolean;
  scope: Exclude<SyncScope, "all">;
  cron?: boolean;
}

/** Un lote de sincronización (≈30–50 s). El cliente debe llamar hasta `done: true`. */
export async function runDashboardSyncBatch(
  options: DashboardSyncBatchOptions
): Promise<DashboardSyncBatchResult> {
  const { continueBatch = false, scope, cron = false } = options;
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
    if (scope === "compra_agil") {
      pending = await initCaSyncPending(supabase, { cron });
    } else {
      const lastSyncAt = await getLastMpSyncAt(supabase, "licitacion");
      const discoverErrors: string[] = [];
      const discovered = await discoverSyncCandidates(
        ticket,
        notifyFilters,
        cron ? null : lastSyncAt,
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
    await appendCompraAgilCandidates(ticket, pending, notifyFilters, (msg) =>
      pending!.errors.push(msg),
      lastSyncAt
    );
    await saveMpSyncPending(supabase, scope, pending);
    return buildBatchResult(pending, false, "compra_agil");
  }

  const batchStarted = Date.now();
  const endIndex = Math.min(pending.index + SYNC_BATCH_SIZE, pending.candidates.length);

  for (let i = pending.index; i < endIndex; i += 1) {
    if (Date.now() - batchStarted > SYNC_BATCH_BUDGET_MS - 6_000) break;

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
      await delay(250);
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

async function runScopedDashboardSync(
  scope: Exclude<SyncScope, "all">,
  cron = false
): Promise<IngestSummary> {
  let last: DashboardSyncBatchResult | null = null;
  let guard = 0;
  do {
    last = await runDashboardSyncBatch({ continueBatch: guard > 0, scope, cron });
    guard += 1;
  } while (!last.done && guard < 120);

  if (!last) {
    throw new Error("No se pudo iniciar la sincronización");
  }
  return last.summary;
}

/** Cron / uso interno: ejecuta CA + licitaciones seguidos y archiva al historial. */
export async function runDashboardSync(): Promise<IngestSummary & { archived?: number }> {
  const ca = await runScopedDashboardSync("compra_agil", true);
  const lic = await runScopedDashboardSync("licitacion", true);
  const { archived } = await archiveStaleDashboardProcesses().catch(() => ({ archived: 0 }));
  return {
    fetched: ca.fetched + lic.fetched,
    created: ca.created + lic.created,
    updated: ca.updated + lic.updated,
    evaluatedIa: 0,
    errors: [...ca.errors, ...lic.errors].slice(0, 20),
    mode: lic.mode ?? ca.mode,
    daysQueried: lic.daysQueried,
    archived,
  };
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
  let updated = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    try {
      const normalized = await refreshProcessByCodigo(
        ticket,
        row.codigo_externo,
        row.tipo as ProcessTipo
      );
      if (!normalized) {
        notFound += 1;
        continue;
      }
      await upsertProcess(supabase, normalized, orgRut, {
        notifyFilters,
        forceRefresh: true,
      });
      updated += 1;
      await delay(300);
    } catch (err) {
      errors.push(
        `${row.codigo_externo}: ${err instanceof Error ? err.message : "Error desconocido"}`
      );
    }
  }

  return { updated, notFound, errors };
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

  let refreshed = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const row of stale ?? []) {
    if (refreshed >= limit) break;
    if (!isPastCierre(row.fecha_cierre as string | null, row.hora_cierre as string | null)) {
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
