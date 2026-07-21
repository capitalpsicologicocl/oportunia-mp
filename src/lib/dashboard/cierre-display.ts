import { mpEstadoDisplayLabel } from "@/lib/ingest/sync-refresh";

export function cierreTimestampMs(
  fecha_cierre: string | null | undefined,
  hora_cierre: string | null | undefined
): number | null {
  if (!fecha_cierre) return null;
  const datePart = fecha_cierre.slice(0, 10);
  const timePart = hora_cierre?.trim() || "23:59";
  const parsed = new Date(`${datePart}T${timePart.length <= 5 ? timePart : "23:59"}:00`);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(fecha_cierre).getTime();
    return Number.isNaN(fallback) ? null : fallback;
  }
  return parsed.getTime();
}

export function isPastCierre(
  fecha_cierre: string | null | undefined,
  hora_cierre: string | null | undefined
): boolean {
  const ms = cierreTimestampMs(fecha_cierre, hora_cierre);
  return ms !== null && ms < Date.now();
}

/** Etiqueta de estado considerando cierre vencido aunque MP diga «Publicada». */
export function effectiveMpEstadoDisplay(
  estado: string | null | undefined,
  adjudicadoAMi: boolean,
  fecha_cierre: string | null | undefined,
  hora_cierre: string | null | undefined,
  adjudicadoRut?: string | null
): ReturnType<typeof mpEstadoDisplayLabel> {
  const base = mpEstadoDisplayLabel(estado, adjudicadoAMi, adjudicadoRut);
  if (base.tone !== "open") return base;
  if (isPastCierre(fecha_cierre, hora_cierre) && /publicad/i.test(estado ?? "")) {
    return { label: "Cierre vencido", tone: "closed" };
  }
  return base;
}
