export type ProcessTipo = "licitacion" | "compra_agil";
export type ApiKeyStatus = "valid" | "invalid" | "expired" | "no_credits" | "missing";
export type Postulabilidad =
  | "alta"
  | "media"
  | "baja"
  | "no_aplica"
  | "pendiente"
  | "revisar";
export type KanbanColumna =
  | "preevaluacion"
  | "preparacion_pt"
  | "postulada"
  | "ejecucion"
  | "cierre"
  | "pagada";
export type ModalidadOtec = "presencial" | "elearning" | "mixta";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export interface ProcessInsert {
  organization_id: string;
  codigo_externo: string;
  tipo: ProcessTipo;
  estado: string | null;
  nombre: string;
  descripcion?: string | null;
  tipo_detalle?: string | null;
  monto_estimado?: number | null;
  monto_raw_api?: string | null;
  monto_sospechoso?: boolean;
  organismo_nombre?: string | null;
  organismo_rut?: string | null;
  unidad_compra?: string | null;
  lugar_ejecucion?: string | null;
  fecha_publicacion?: string | null;
  fecha_cierre?: string | null;
  fecha_cierre_2?: string | null;
  hora_publicacion?: string | null;
  hora_cierre?: string | null;
  hora_cierre_2?: string | null;
  dias_para_cierre?: number | null;
  url_publica?: string | null;
  servicios_requeridos?: string | null;
  num_items?: number | null;
  adjudicado_rut?: string | null;
  adjudicado_nombre?: string | null;
  adjudicado_a_mi?: boolean;
  rubros_unspsc?: string[];
  content_hash?: string | null;
  num_personas?: string | null;
  modalidad_texto?: string | null;
  fechas_ejecucion?: string | null;
  requiere_arrendar_lugar?: string | null;
  coffee?: string | null;
  almuerzo?: string | null;
  permite_consorcio?: string | null;
  plazo_preguntas?: string | null;
  garantia_seriedad?: string | null;
  garantia_fiel_cumplimiento?: string | null;
  last_synced_at?: string | null;
  synced_via_dashboard?: boolean;
  dashboard_archived_at?: string | null;
}

export interface IngestSummary {
  fetched: number;
  created: number;
  updated: number;
  evaluatedIa: number;
  errors: string[];
  mode?: "initial" | "incremental";
  daysQueried?: number;
  archived?: number;
}

export interface DashboardSyncBatchResult {
  done: boolean;
  summary: IngestSummary;
  progress: { total: number; processed: number };
  phase?: "discover" | "compra_agil" | "enrich" | "finalize";
}
