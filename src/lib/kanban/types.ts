import type { KanbanColumna, ModalidadOtec, Postulabilidad, ProcessTipo } from "@/types/database";
import type { AnalisisFinancieroJson } from "@/lib/kanban/financial-analysis";
import type { BacklogItem } from "@/lib/kanban/backlog";
import type { UbicacionChile } from "@/lib/kanban/ubicaciones";

export interface KanbanCostoItem {
  concepto: string;
  monto: number | null;
}

export interface KanbanProcessSummary {
  codigo_externo: string;
  nombre: string;
  tipo: ProcessTipo;
  monto_estimado: number | null;
  fecha_cierre: string | null;
  hora_cierre: string | null;
  hora_cierre_2: string | null;
  organismo_nombre: string | null;
  lugar_ejecucion: string | null;
  url_publica: string | null;
  adjudicado_a_mi: boolean;
  adjudicado_rut: string | null;
  estado: string | null;
}

export interface KanbanOtecFields {
  modalidad: ModalidadOtec | null;
  codigo_sence: string | null;
  num_participantes: number | null;
  duracion_horas: number | null;
}

export interface KanbanCustomField {
  id?: string;
  field_key: string;
  field_value: string | null;
  field_type: "text" | "number";
}

export interface KanbanContactFields {
  contacto_contraparte: string | null;
  contacto_responsable: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  contacto_direccion: string | null;
  direccion_ejecucion: string | null;
}

export interface KanbanCardRow {
  id: string;
  process_id: string;
  columna: KanbanColumna;
  orden: number;
  en_pipeline: boolean;
  descartado: boolean;
  estado_interno: string | null;
  responsable: string | null;
  responsable_user_id: string | null;
  fecha_postulacion: string | null;
  monto_ofertado: number | null;
  observaciones: string | null;
  analisis_financiero: string | null;
  analisis_financiero_json: AnalisisFinancieroJson;
  costos: KanbanCostoItem[];
  process: KanbanProcessSummary;
  postulabilidad: Postulabilidad | null;
  otec: KanbanOtecFields | null;
  custom_fields: KanbanCustomField[];
  contacto: KanbanContactFields;
  fechas_ejecucion: string | null;
  link_propuesta_tecnica: string | null;
  link_carpeta_interna: string | null;
  campos_descriptivos: import("@/lib/kanban/financial-analysis").CamposDescriptivosJson;
  ubicaciones: UbicacionChile[];
  backlog: BacklogItem[];
}

export interface KanbanBoardData {
  cards: KanbanCardRow[];
  stats: {
    total: number;
    byColumn: Record<KanbanColumna, number>;
  };
  yearStats: KanbanYearStats;
}

export interface KanbanYearStats {
  year: number;
  adjudicadas: number;
  montoPostulado: number;
  montoAdjudicado: number;
  ingresoEstimado: number;
}

export interface KanbanCardUpdatePayload {
  columna?: KanbanColumna;
  orden?: number;
  descartado?: boolean;
  en_pipeline?: boolean;
  estado_interno?: string | null;
  responsable?: string | null;
  responsable_user_id?: string | null;
  fecha_postulacion?: string | null;
  monto_ofertado?: number | null;
  observaciones?: string | null;
  analisis_financiero?: string | null;
  analisis_financiero_json?: AnalisisFinancieroJson;
  costos?: KanbanCostoItem[];
  otec?: Partial<KanbanOtecFields> | null;
  custom_fields?: KanbanCustomField[];
  contacto?: Partial<KanbanContactFields>;
  fechas_ejecucion?: string | null;
  link_propuesta_tecnica?: string | null;
  link_carpeta_interna?: string | null;
  campos_descriptivos?: import("@/lib/kanban/financial-analysis").CamposDescriptivosJson;
  ubicaciones_json?: UbicacionChile[];
  backlog_json?: BacklogItem[];
}
