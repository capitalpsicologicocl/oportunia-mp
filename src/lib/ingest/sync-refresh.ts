import type { ProcessTipo } from "@/types/database";

export type SyncScope = "compra_agil" | "licitacion" | "all";

export type ProcessRefreshSnapshot = {
  estado: string | null;
  adjudicado_a_mi?: boolean;
  adjudicado_rut?: string | null;
  tipo: ProcessTipo;
  fecha_cierre?: string | null;
  last_synced_at?: string | null;
  hora_publicacion?: string | null;
  hora_cierre?: string | null;
  en_pipeline?: boolean;
};

export function isTerminalMpEstado(estado: string | null | undefined): boolean {
  return /adjudicad|desiert|revocad|cancelad/i.test(estado ?? "");
}

export function isClosedMpEstado(estado: string | null | undefined): boolean {
  return /cerrad/i.test(estado ?? "");
}

/** Etiqueta legible para Kanban / dashboard. */
export function mpEstadoDisplayLabel(
  estado: string | null | undefined,
  adjudicadoAMi: boolean,
  adjudicadoRut?: string | null
): { label: string; tone: "open" | "closed" | "won" | "lost" | "selected" | "neutral" } {
  if (adjudicadoAMi) {
    return { label: "Adjudicada", tone: "won" };
  }

  const e = (estado ?? "").toLowerCase();
  if (/proveedor seleccionado|adjudicad/.test(e) || adjudicadoRut) {
    return { label: "Proveedor seleccionado", tone: "selected" };
  }
  if (/desiert|cancelad|revocad/.test(e)) {
    return { label: estado?.trim() || "Cerrada", tone: "neutral" };
  }
  if (/cerrad/.test(e)) {
    return { label: "Cerrada", tone: "closed" };
  }
  if (/publicad|evaluaci|apertura|activ/.test(e) || !estado) {
    return { label: "Abierta", tone: "open" };
  }
  return { label: estado?.trim() || "—", tone: "neutral" };
}

/**
 * ¿Volver a consultar detalle en la API de MP?
 * CA cerrada SÍ se refresca hasta pasar a Adjudicada/Desierta/Cancelada.
 */
export function processNeedsApiRefresh(row: ProcessRefreshSnapshot): boolean {
  if (row.en_pipeline) return true;
  if (row.adjudicado_a_mi) return true;

  const incomplete = !row.hora_publicacion || !row.hora_cierre;
  if (incomplete) return true;

  const estado = row.estado ?? "";

  if (isClosedMpEstado(estado) && !isTerminalMpEstado(estado)) {
    return true;
  }

  if (isTerminalMpEstado(estado) && !row.adjudicado_a_mi) {
    return false;
  }

  if (/adjudicad/i.test(estado) && !row.adjudicado_a_mi) {
    if (row.adjudicado_rut && row.last_synced_at) {
      const age = Date.now() - new Date(row.last_synced_at).getTime();
      if (age > 5 * 24 * 60 * 60 * 1000) return false;
    }
    return !row.adjudicado_rut;
  }

  if (/publicad|evaluaci|apertura|activ/i.test(estado) || !estado.trim()) {
    return true;
  }

  return false;
}
