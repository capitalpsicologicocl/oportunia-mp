import type { KanbanColumna } from "@/types/database";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";

/** Etapas Kanban agrupadas en filtro «Ejecución+». */
export const CRM_EJECUCION_PLUS_COLUMNS: KanbanColumna[] = ["ejecucion", "cierre", "pagada"];

export type DashboardCrmFilterValue =
  | "all"
  | "sin_crm"
  | "en_crm"
  | "ejecucion_plus"
  | KanbanColumna;

export const CRM_BADGE_CLASS: Record<KanbanColumna, string> = {
  preevaluacion: "border-[#d4a017]/80 bg-[#d4a017]/25 text-[#11233d] font-semibold",
  preparacion_pt: "border-blue-400/60 bg-blue-50 text-blue-900 font-medium",
  postulada: "border-[#d4a017] bg-[#d4a017]/35 text-[#11233d] font-semibold",
  ejecucion: "border-amber-500/50 bg-amber-50 text-amber-950 font-medium",
  cierre: "border-violet-500/50 bg-violet-50 text-violet-950 font-medium",
  pagada: "border-emerald-600/50 bg-emerald-50 text-emerald-900 font-medium",
};

export const CRM_ROW_CLASS: Record<KanbanColumna, string> = {
  preevaluacion: "border-l-[3px] border-l-[#d4a017] bg-[#d4a017]/[0.06]",
  preparacion_pt: "border-l-[3px] border-l-blue-400 bg-blue-50/30",
  postulada: "border-l-[3px] border-l-[#d4a017] bg-[#d4a017]/10",
  ejecucion: "border-l-[3px] border-l-amber-500 bg-amber-50/25",
  cierre: "border-l-[3px] border-l-violet-500 bg-violet-50/25",
  pagada: "border-l-[3px] border-l-emerald-600 bg-emerald-50/30",
};

export function crmFilterLabel(value: string): string {
  if (value === "all") return "Todos";
  if (value === "sin_crm") return "Sin CRM";
  if (value === "en_crm") return "En CRM (cualquier etapa)";
  if (value === "ejecucion_plus") return "Ejecución en adelante";
  return KANBAN_COLUMN_LABELS[value as KanbanColumna] ?? value;
}

export function matchesCrmFilter(
  enCrm: boolean,
  crmColumna: string | null,
  filter: DashboardCrmFilterValue
): boolean {
  if (filter === "all") return true;
  if (filter === "sin_crm") return !enCrm;
  if (filter === "en_crm") return enCrm;
  if (filter === "ejecucion_plus") {
    return enCrm && CRM_EJECUCION_PLUS_COLUMNS.includes(crmColumna as KanbanColumna);
  }
  return enCrm && crmColumna === filter;
}
