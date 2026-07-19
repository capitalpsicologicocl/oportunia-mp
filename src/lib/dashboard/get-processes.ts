import { createServiceClient } from "@/lib/supabase/server";
import { isExcluded, keywordMatchesInText, normalizeMatchText } from "@/lib/dashboard/content-match";
import { looksLikeProcessCodigo } from "@/lib/dashboard/process-codigo";
import { matchesRubrosUnspsc } from "@/lib/dashboard/unspsc-match";
import { matchesCrmFilter, type DashboardCrmFilterValue } from "@/lib/dashboard/crm-styles";
import { unspscCodesForMatching } from "@/lib/onboarding/rubros-unspsc";
import { DEFAULT_ORG_ID, type Postulabilidad, type ProcessTipo } from "@/types/database";

export type DashboardCrmFilter = DashboardCrmFilterValue;

export type DashboardSort =
  | "cierre_asc"
  | "cierre_desc"
  | "publicacion_asc"
  | "publicacion_desc"
  | "monto_asc"
  | "monto_desc";

export interface DashboardFilters {
  q?: string;
  tipo?: ProcessTipo | "all";
  postulabilidad?: Postulabilidad | "all";
  estado?: string;
  filtro?: "ambos" | "keywords" | "rubros" | "todos";
  adjudicadoAMi?: boolean;
  archived?: boolean;
  crm?: DashboardCrmFilter;
  page?: number;
  pageSize?: number;
  sort?: DashboardSort;
}

export type ProcesoEstadoRevision = "no_revisada" | "revisada" | "descartada";

export interface ProcessRow {
  id: string;
  codigo_externo: string;
  tipo: ProcessTipo;
  nombre: string;
  estado: string | null;
  organismo_nombre: string | null;
  monto_estimado: number | null;
  monto_sospechoso: boolean;
  fecha_cierre: string | null;
  fecha_publicacion: string | null;
  hora_publicacion: string | null;
  hora_cierre: string | null;
  url_publica: string | null;
  servicios_requeridos: string | null;
  rubros_unspsc: string[] | null;
  adjudicado_a_mi: boolean;
  postulabilidad: Postulabilidad | null;
  relevancia_score: number | null;
  en_crm: boolean;
  crm_columna: string | null;
  estado_revision: ProcesoEstadoRevision;
  dashboard_archived_at: string | null;
}

export interface DashboardResult {
  processes: ProcessRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  keywords: string[];
  rubros: Array<{ codigo_unspsc: string; nombre: string }>;
  stats: {
    totalEnBase: number;
    matchingFiltro: number;
  };
}

function cierreTimestamp(row: Pick<ProcessRow, "fecha_cierre" | "hora_cierre">): number {
  if (!row.fecha_cierre) return Number.MAX_SAFE_INTEGER;
  const datePart = row.fecha_cierre.slice(0, 10);
  const timePart = row.hora_cierre?.trim() || "23:59";
  const parsed = new Date(`${datePart}T${timePart.length <= 5 ? timePart : "23:59"}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(row.fecha_cierre).getTime() : parsed.getTime();
}

function sortProcesses(rows: ProcessRow[], sort: DashboardSort = "cierre_asc"): ProcessRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sort) {
      case "cierre_desc":
        return cierreTimestamp(b) - cierreTimestamp(a);
      case "publicacion_asc":
        return (a.fecha_publicacion ? new Date(a.fecha_publicacion).getTime() : 0) -
          (b.fecha_publicacion ? new Date(b.fecha_publicacion).getTime() : 0);
      case "publicacion_desc":
        return (b.fecha_publicacion ? new Date(b.fecha_publicacion).getTime() : 0) -
          (a.fecha_publicacion ? new Date(a.fecha_publicacion).getTime() : 0);
      case "monto_asc":
        return (a.monto_estimado ?? 0) - (b.monto_estimado ?? 0);
      case "monto_desc":
        return (b.monto_estimado ?? 0) - (a.monto_estimado ?? 0);
      case "cierre_asc":
      default:
        return cierreTimestamp(a) - cierreTimestamp(b);
    }
  });
  return copy;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function buildSearchText(
  row: Pick<ProcessRow, "nombre" | "servicios_requeridos"> & { descripcion?: string | null }
): string {
  return normalizeMatchText(
    `${row.nombre ?? ""} ${row.servicios_requeridos ?? ""} ${row.descripcion ?? ""}`
  );
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((k) => keywordMatchesInText(text, k));
}

function matchesRubros(text: string, rubros: Array<{ nombre: string }>): boolean {
  const normalized = normalizeMatchText(text);
  return rubros.some((r) => normalized.includes(normalizeMatchText(r.nombre)));
}

function matchesContentFilter(
  text: string,
  keywords: string[],
  rubros: Array<{ nombre: string; codigo_unspsc?: string }>,
  filtro: DashboardFilters["filtro"],
  unspscCodigos?: string[] | null
): boolean {
  if (isExcluded(text)) return false;
  if (filtro === "todos") return true;
  const byKeyword = keywords.length > 0 && matchesKeywords(text, keywords);
  const byRubro = rubros.length > 0 && matchesRubros(text, rubros);
  const byUnspsc =
    rubros.length > 0 &&
    matchesRubrosUnspsc(unspscCodigos ?? [], unspscCodesForMatching(rubros));
  if (filtro === "keywords") return byKeyword;
  if (filtro === "rubros") return byRubro || byUnspsc;
  if (keywords.length === 0 && rubros.length === 0) return true;
  if (keywords.length === 0) return byRubro || byUnspsc;
  if (rubros.length === 0) return byKeyword;
  return byKeyword || byRubro || byUnspsc;
}

export async function getDashboardProcesses(
  filters: DashboardFilters = {}
): Promise<DashboardResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const filtro = filters.filtro ?? "ambos";
  const archivedView = filters.archived ?? false;
  const tipoLocked =
    filters.tipo && filters.tipo !== "all" ? filters.tipo : null;

  const supabase = createServiceClient();

  let baseCountQuery = supabase
    .from("processes")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("synced_via_dashboard", true);

  if (archivedView) {
    baseCountQuery = baseCountQuery.not("dashboard_archived_at", "is", null);
  } else {
    baseCountQuery = baseCountQuery.is("dashboard_archived_at", null);
  }

  const countQuery = tipoLocked
    ? baseCountQuery.eq("tipo", tipoLocked)
    : baseCountQuery;

  const [{ data: keywordRows }, { data: rubroRows }, { count: totalEnBase }] = await Promise.all([
    supabase
      .from("keywords")
      .select("palabra")
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("activa", true),
    supabase
      .from("selected_rubros")
      .select("codigo_unspsc, nombre")
      .eq("organization_id", DEFAULT_ORG_ID),
    countQuery,
  ]);

  const keywords = (keywordRows ?? []).map((k) => k.palabra);
  const rubros = rubroRows ?? [];

  let query = supabase
    .from("processes")
    .select(
      `
      id,
      codigo_externo,
      tipo,
      nombre,
      estado,
      organismo_nombre,
      monto_estimado,
      monto_sospechoso,
      fecha_cierre,
      fecha_publicacion,
      hora_publicacion,
      hora_cierre,
      url_publica,
      servicios_requeridos,
      rubros_unspsc,
      adjudicado_a_mi,
      estado_revision,
      dashboard_archived_at
    `
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("synced_via_dashboard", true);

  if (archivedView) {
    query = query.not("dashboard_archived_at", "is", null);
  } else {
    query = query.is("dashboard_archived_at", null);
  }

  if (tipoLocked) {
    query = query.eq("tipo", tipoLocked);
  }

  query = query.order("fecha_publicacion", { ascending: false, nullsFirst: false });

  if (filters.estado && filters.estado !== "all") {
    query = query.ilike("estado", `%${escapeIlike(filters.estado)}%`);
  }

  if (filters.q?.trim()) {
    const q = escapeIlike(filters.q.trim());
    query = query.or(`nombre.ilike.%${q}%,servicios_requeridos.ilike.%${q}%,codigo_externo.ilike.%${q}%`);
  }

  const { data: rawRows, error } = await query;
  if (error) throw new Error(error.message);

  let rows: ProcessRow[] = (rawRows ?? []).map((row) => ({
    id: row.id,
    codigo_externo: row.codigo_externo,
    tipo: row.tipo as ProcessTipo,
    nombre: row.nombre,
    estado: row.estado,
    organismo_nombre: row.organismo_nombre,
    monto_estimado: row.monto_estimado,
    monto_sospechoso: row.monto_sospechoso,
    fecha_cierre: row.fecha_cierre,
    fecha_publicacion: row.fecha_publicacion,
    hora_publicacion: row.hora_publicacion,
    hora_cierre: row.hora_cierre,
    url_publica: row.url_publica,
    servicios_requeridos: row.servicios_requeridos,
    rubros_unspsc: (row.rubros_unspsc as string[] | null) ?? null,
    adjudicado_a_mi: row.adjudicado_a_mi,
    postulabilidad: null,
    relevancia_score: null,
    en_crm: false,
    crm_columna: null,
    estado_revision: (row.estado_revision as ProcesoEstadoRevision) ?? "no_revisada",
    dashboard_archived_at: (row.dashboard_archived_at as string | null) ?? null,
  }));

  const processIds = rows.map((r) => r.id);
  const { getProcessPipelineStatus } = await import("@/lib/kanban/queries");
  const pipelineMap = await getProcessPipelineStatus(processIds);
  rows = rows.map((row) => ({
    ...row,
    en_crm: pipelineMap[row.id]?.en_pipeline ?? false,
    crm_columna: pipelineMap[row.id]?.columna ?? null,
  }));

  if (filters.postulabilidad && filters.postulabilidad !== "all") {
    rows = rows.filter((r) => r.postulabilidad === filters.postulabilidad);
  }

  if (filters.adjudicadoAMi) {
    rows = rows.filter((r) => r.adjudicado_a_mi);
  }

  if (filters.crm && filters.crm !== "all") {
    rows = rows.filter((r) => matchesCrmFilter(r.en_crm, r.crm_columna, filters.crm!));
  }

  rows = rows.filter((row) => !isExcluded(buildSearchText(row)));

  if (filtro !== "todos") {
    const qTrimmed = filters.q?.trim() ?? "";
    const skipContentFilter = qTrimmed.length > 0 && looksLikeProcessCodigo(qTrimmed);
    if (!skipContentFilter) {
      rows = rows.filter((row) =>
        matchesContentFilter(
          buildSearchText(row),
          keywords,
          rubros,
          filtro,
          row.rubros_unspsc
        )
      );
    }
  }

  const sort = filters.sort ?? "publicacion_desc";
  rows = sortProcesses(rows, sort);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const processes = rows.slice(start, start + pageSize);

  return {
    processes,
    total,
    page: safePage,
    pageSize,
    totalPages,
    keywords,
    rubros,
    stats: {
      totalEnBase: totalEnBase ?? 0,
      matchingFiltro: total,
    },
  };
}
