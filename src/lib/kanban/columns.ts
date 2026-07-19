import type { KanbanColumna } from "@/types/database";

export const KANBAN_COLUMNS: KanbanColumna[] = [
  "preevaluacion",
  "preparacion_pt",
  "postulada",
  "ejecucion",
  "cierre",
  "pagada",
];

export const KANBAN_COLUMN_LABELS: Record<KanbanColumna, string> = {
  preevaluacion: "Pre-evaluación",
  preparacion_pt: "Preparación PT",
  postulada: "Postulada",
  ejecucion: "Ejecución",
  cierre: "Cierre",
  pagada: "Pagada",
};

export const KANBAN_COLUMN_COLORS: Record<KanbanColumna, string> = {
  preevaluacion: "border-t-slate-400",
  preparacion_pt: "border-t-blue-500",
  postulada: "border-t-[#d4a017]",
  ejecucion: "border-t-amber-500",
  cierre: "border-t-violet-500",
  pagada: "border-t-emerald-500",
};

export const MODALIDAD_OTEC_LABELS = {
  presencial: "Presencial",
  elearning: "E-learning",
  mixta: "Mixta",
} as const;
