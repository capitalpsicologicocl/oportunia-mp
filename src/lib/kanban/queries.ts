import { createServiceClient } from "@/lib/supabase/server";
import {
  ingresoNeto,
  parseAnalisisFinanciero,
  parseCamposDescriptivos,
  recalcularAnalisis,
  totalCostos,
} from "@/lib/kanban/financial-analysis";
import type { KanbanBoardData, KanbanCardRow, KanbanCostoItem, KanbanCustomField, KanbanYearStats } from "@/lib/kanban/types";
import { KANBAN_COLUMNS } from "@/lib/kanban/columns";
import { DEFAULT_ORG_ID, type KanbanColumna, type ModalidadOtec, type Postulabilidad } from "@/types/database";

export interface KanbanListFilters {
  q?: string;
  includeArchived?: boolean;
}

const CARD_SELECT = `
  id,
  process_id,
  columna,
  orden,
  en_pipeline,
  descartado,
  estado_interno,
  responsable,
  fecha_postulacion,
  monto_ofertado,
  observaciones,
  analisis_financiero,
  analisis_financiero_json,
  costos,
  contacto_contraparte,
  contacto_responsable,
  contacto_email,
  contacto_telefono,
  contacto_direccion,
  direccion_ejecucion,
  fechas_ejecucion,
  link_propuesta_tecnica,
  link_carpeta_interna,
  campos_descriptivos_json,
  processes (
    codigo_externo,
    nombre,
    tipo,
    monto_estimado,
    fecha_cierre,
    hora_cierre,
    hora_cierre_2,
    organismo_nombre,
    lugar_ejecucion,
    url_publica,
    adjudicado_a_mi,
    adjudicado_rut,
    estado,
    ai_evaluations ( postulabilidad )
  ),
  otec_fields (
    modalidad,
    codigo_sence,
    num_participantes,
    duracion_horas
  ),
  kanban_custom_fields (
    id,
    field_key,
    field_value,
    field_type
  )
`;

function parseCostos(raw: unknown): KanbanCostoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const concepto = typeof row.concepto === "string" ? row.concepto : "";
      const monto =
        typeof row.monto === "number"
          ? row.monto
          : row.monto != null
            ? Number(row.monto)
            : null;
      return { concepto, monto: Number.isNaN(monto as number) ? null : monto };
    })
    .filter((item) => item.concepto.trim());
}

function mapCardRow(raw: Record<string, unknown>): KanbanCardRow | null {
  const processRaw = raw.processes as Record<string, unknown> | null;
  if (!processRaw) return null;
  const evalsRaw = processRaw.ai_evaluations as
    | { postulabilidad: Postulabilidad }
    | { postulabilidad: Postulabilidad }[]
    | null;
  const evals = Array.isArray(evalsRaw) ? evalsRaw[0] : evalsRaw;

  const otecRawValue = raw.otec_fields;
  const otecRaw = Array.isArray(otecRawValue)
    ? (otecRawValue[0] as Record<string, unknown> | undefined)
    : (otecRawValue as Record<string, unknown> | null);
  const customRaw = (raw.kanban_custom_fields ?? []) as Array<Record<string, unknown>>;
  const montoOfertado = (raw.monto_ofertado as number | null) ?? null;
  const analisisJson = parseAnalisisFinanciero(raw.analisis_financiero_json);

  return {
    id: raw.id as string,
    process_id: raw.process_id as string,
    columna: raw.columna as KanbanColumna,
    orden: raw.orden as number,
    en_pipeline: Boolean(raw.en_pipeline),
    descartado: Boolean(raw.descartado),
    estado_interno: (raw.estado_interno as string | null) ?? null,
    responsable: (raw.responsable as string | null) ?? null,
    fecha_postulacion: (raw.fecha_postulacion as string | null) ?? null,
    monto_ofertado: montoOfertado,
    observaciones: (raw.observaciones as string | null) ?? null,
    analisis_financiero: (raw.analisis_financiero as string | null) ?? null,
    analisis_financiero_json: recalcularAnalisis(analisisJson, montoOfertado),
    costos: parseCostos(raw.costos),
    process: {
      codigo_externo: processRaw.codigo_externo as string,
      nombre: processRaw.nombre as string,
      tipo: processRaw.tipo as KanbanCardRow["process"]["tipo"],
      monto_estimado: (processRaw.monto_estimado as number | null) ?? null,
      fecha_cierre: (processRaw.fecha_cierre as string | null) ?? null,
      hora_cierre: (processRaw.hora_cierre as string | null) ?? null,
      hora_cierre_2: (processRaw.hora_cierre_2 as string | null) ?? null,
      organismo_nombre: (processRaw.organismo_nombre as string | null) ?? null,
      lugar_ejecucion: (processRaw.lugar_ejecucion as string | null) ?? null,
      url_publica: (processRaw.url_publica as string | null) ?? null,
      adjudicado_a_mi: Boolean(processRaw.adjudicado_a_mi),
      adjudicado_rut: (processRaw.adjudicado_rut as string | null) ?? null,
      estado: (processRaw.estado as string | null) ?? null,
    },
    postulabilidad: evals?.postulabilidad ?? null,
    otec: otecRaw
      ? {
          modalidad: (otecRaw.modalidad as ModalidadOtec | null) ?? null,
          codigo_sence: (otecRaw.codigo_sence as string | null) ?? null,
          num_participantes: (otecRaw.num_participantes as number | null) ?? null,
          duracion_horas: (otecRaw.duracion_horas as number | null) ?? null,
        }
      : null,
    custom_fields: customRaw.map(
      (field): KanbanCustomField => ({
        id: field.id as string,
        field_key: field.field_key as string,
        field_value: (field.field_value as string | null) ?? null,
        field_type: (field.field_type as "text" | "number") ?? "text",
      })
    ),
    contacto: {
      contacto_contraparte: (raw.contacto_contraparte as string | null) ?? null,
      contacto_responsable: (raw.contacto_responsable as string | null) ?? null,
      contacto_email: (raw.contacto_email as string | null) ?? null,
      contacto_telefono: (raw.contacto_telefono as string | null) ?? null,
      contacto_direccion: (raw.contacto_direccion as string | null) ?? null,
      direccion_ejecucion:
        (raw.direccion_ejecucion as string | null) ?? (processRaw.lugar_ejecucion as string | null) ?? null,
    },
    fechas_ejecucion: (raw.fechas_ejecucion as string | null) ?? null,
    link_propuesta_tecnica: (raw.link_propuesta_tecnica as string | null) ?? null,
    link_carpeta_interna: (raw.link_carpeta_interna as string | null) ?? null,
    campos_descriptivos: parseCamposDescriptivos(raw.campos_descriptivos_json),
  };
}

function matchesSearch(row: KanbanCardRow, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    row.process.codigo_externo.toLowerCase().includes(needle) ||
    row.process.nombre.toLowerCase().includes(needle) ||
    (row.responsable?.toLowerCase().includes(needle) ?? false) ||
    (row.estado_interno?.toLowerCase().includes(needle) ?? false)
  );
}

function emptyByColumn(): Record<KanbanColumna, number> {
  return {
    preevaluacion: 0,
    preparacion_pt: 0,
    postulada: 0,
    ejecucion: 0,
    cierre: 0,
    pagada: 0,
  };
}

type KanbanCardScope = "pipeline" | "archived";

async function fetchCards(scope: KanbanCardScope): Promise<KanbanCardRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("kanban_cards")
    .select(CARD_SELECT)
    .eq("organization_id", DEFAULT_ORG_ID);

  if (scope === "pipeline") {
    query = query.eq("en_pipeline", true).eq("descartado", false);
  } else {
    query = query.eq("descartado", true);
  }

  const { data, error } = await query.order("orden", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => mapCardRow(row as Record<string, unknown>))
    .filter((row): row is KanbanCardRow => row !== null);
}

export async function getKanbanYearStats(year = new Date().getFullYear()): Promise<KanbanYearStats> {
  const cards = await fetchCards("pipeline");
  const inYear = cards.filter((card) => {
    const ref = card.fecha_postulacion ?? card.process.fecha_cierre;
    if (!ref) return false;
    return new Date(ref).getFullYear() === year;
  });

  let montoPostulado = 0;
  let montoAdjudicado = 0;
  let ingresoEstimado = 0;
  let adjudicadas = 0;

  for (const card of inYear) {
    const oferta = card.monto_ofertado ?? card.process.monto_estimado ?? 0;
    if (card.columna === "postulada" || card.fecha_postulacion) {
      montoPostulado += oferta;
    }
    if (card.process.adjudicado_a_mi || card.columna === "cierre" || card.columna === "pagada") {
      adjudicadas += 1;
      montoAdjudicado += oferta;
      ingresoEstimado += ingresoNeto(oferta, card.analisis_financiero_json) ?? oferta - totalCostos(card.analisis_financiero_json);
    }
  }

  return { year, adjudicadas, montoPostulado, montoAdjudicado, ingresoEstimado };
}

export async function getKanbanBoard(filters: KanbanListFilters = {}): Promise<KanbanBoardData> {
  let cards = await fetchCards("pipeline");

  if (filters.q?.trim()) {
    cards = cards.filter((row) => matchesSearch(row, filters.q!.trim()));
  }

  const byColumn = emptyByColumn();
  for (const card of cards) {
    if (byColumn[card.columna] !== undefined) {
      byColumn[card.columna] += 1;
    }
  }

  const yearStats = await getKanbanYearStats();

  return {
    cards,
    stats: { total: cards.length, byColumn },
    yearStats,
  };
}

export async function getArchivedKanbanCards(q?: string): Promise<KanbanCardRow[]> {
  let cards = await fetchCards("archived");

  if (q?.trim()) {
    cards = cards.filter((row) => matchesSearch(row, q.trim()));
  }

  return cards;
}

/** Envía un proceso del dashboard a Pre-evaluación en el CRM. */
export async function sendProcessToPreevaluacion(processId: string): Promise<{ cardId: string }> {
  const supabase = createServiceClient();

  const { data: process } = await supabase
    .from("processes")
    .select("id")
    .eq("id", processId)
    .eq("organization_id", DEFAULT_ORG_ID)
    .maybeSingle();

  if (!process) throw new Error("Proceso no encontrado");

  const { count } = await supabase
    .from("kanban_cards")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("columna", "preevaluacion")
    .eq("en_pipeline", true);

  const now = new Date().toISOString();
  const { data: card, error } = await supabase
    .from("kanban_cards")
    .upsert(
      {
        organization_id: DEFAULT_ORG_ID,
        process_id: processId,
        columna: "preevaluacion",
        orden: (count ?? 0) + 1,
        en_pipeline: true,
        descartado: false,
        descartado_at: null,
        updated_at: now,
      },
      { onConflict: "process_id" }
    )
    .select("id, en_pipeline, descartado")
    .single();

  if (error) {
    if (/en_pipeline/i.test(error.message)) {
      throw new Error(
        "Falta migración Kanban CRM (20260316200000_kanban_crm_enhancements.sql) en Supabase."
      );
    }
    throw new Error(error.message);
  }

  if (!card?.en_pipeline || card.descartado) {
    throw new Error("No se pudo activar la tarjeta en el pipeline CRM.");
  }

  await supabase
    .from("processes")
    .update({ estado_revision: "revisada", updated_at: now })
    .eq("id", processId)
    .eq("organization_id", DEFAULT_ORG_ID);

  return { cardId: card.id };
}

async function fetchActivePipelineMap(): Promise<
  Record<string, { en_pipeline: boolean; columna: KanbanColumna | null }>
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kanban_cards")
    .select("process_id, columna")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("en_pipeline", true)
    .eq("descartado", false);

  if (error) throw new Error(error.message);

  const map: Record<string, { en_pipeline: boolean; columna: KanbanColumna | null }> = {};
  for (const row of data ?? []) {
    map[row.process_id] = {
      en_pipeline: true,
      columna: row.columna as KanbanColumna,
    };
  }
  return map;
}

export async function getProcessPipelineStatus(
  processIds: string[]
): Promise<Record<string, { en_pipeline: boolean; columna: KanbanColumna | null }>> {
  if (processIds.length === 0) return {};

  const pipelineMap = await fetchActivePipelineMap();
  const map: Record<string, { en_pipeline: boolean; columna: KanbanColumna | null }> = {};
  for (const id of processIds) {
    if (pipelineMap[id]) map[id] = pipelineMap[id];
  }
  return map;
}

export async function createKanbanCardForProcess(codigoExterno: string): Promise<KanbanCardRow> {
  const supabase = createServiceClient();
  const codigo = codigoExterno.trim();

  const { data: process, error: processError } = await supabase
    .from("processes")
    .select("id")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("codigo_externo", codigo)
    .maybeSingle();

  if (processError) throw new Error(processError.message);
  if (!process) throw new Error(`No existe el proceso ${codigo} en la base de datos`);

  await sendProcessToPreevaluacion(process.id);

  const board = await getKanbanBoard({ q: codigo });
  const card = board.cards.find((c) => c.process_id === process.id);
  if (!card) throw new Error("Tarjeta creada pero no visible en el tablero");
  return card;
}
