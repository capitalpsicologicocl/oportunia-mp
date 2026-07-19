/** Ubicaciones de ejecución para tarjetas Kanban (Chile). */

export interface UbicacionChile {
  ciudad_comuna: string;
  region: string;
}

const REGION_ABBR: Record<string, string> = {
  "arica y parinacota": "AP",
  tarapacá: "TA",
  tarapaca: "TA",
  antofagasta: "AN",
  atacama: "AT",
  coquimbo: "CO",
  valparaíso: "VS",
  valparaiso: "VS",
  "región metropolitana": "RM",
  "region metropolitana": "RM",
  metropolitana: "RM",
  "libertador general bernardo o'higgins": "OH",
  "o'higgins": "OH",
  ohiggins: "OH",
  maule: "ML",
  ñuble: "NB",
  nuble: "NB",
  "bío bío": "BI",
  "bio bio": "BI",
  biobío: "BI",
  biobio: "BI",
  araucanía: "AR",
  araucania: "AR",
  "los ríos": "LR",
  "los rios": "LR",
  "los lagos": "LL",
  "aisén del general carlos ibáñez del campo": "AI",
  aysén: "AI",
  aysen: "AI",
  "magallanes y de la antártica chilena": "MA",
  magallanes: "MA",
  nacional: "Nacional",
};

function normalizeRegion(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase().replace(/^región\s+(de(l?\s+)?|del?\s+)?/i, "").trim();
  const abbr = REGION_ABBR[lower] ?? REGION_ABBR[trimmed.toLowerCase()];
  if (abbr) return abbr;
  if (/^[A-Z]{2,3}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

function parseSegment(segment: string): UbicacionChile | null {
  const text = segment.trim();
  if (!text) return null;

  const todoChile = /todo\s*chile/i.test(text);
  if (todoChile) return { ciudad_comuna: "Todo Chile", region: "Nacional" };

  const regionMatch = text.match(/(.+?)[,\-–—]\s*(regi[oó]n\s+.+)$/i);
  if (regionMatch) {
    return {
      ciudad_comuna: regionMatch[1].trim(),
      region: normalizeRegion(regionMatch[2]),
    };
  }

  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybeRegion = parts[parts.length - 1];
    const regionNorm = normalizeRegion(maybeRegion);
    const isRegion =
      /^regi[oó]n/i.test(maybeRegion) ||
      Object.keys(REGION_ABBR).some((k) => k === maybeRegion.toLowerCase()) ||
      /^[A-Z]{2,3}$/.test(maybeRegion);
    if (isRegion) {
      return {
        ciudad_comuna: parts.slice(0, -1).join(", "),
        region: regionNorm,
      };
    }
  }

  if (parts.length === 2) {
    return { ciudad_comuna: parts[0], region: normalizeRegion(parts[1]) };
  }

  return { ciudad_comuna: text, region: "" };
}

/** Parsea texto libre de lugar_ejecucion en ubicaciones estructuradas. */
export function parseLugarEjecucion(text: string | null): UbicacionChile[] {
  if (!text?.trim()) return [];

  const segments = text
    .split(/\||\n|\/(?=\s*[A-ZÁÉÍÓÚ])/)
    .flatMap((s) => s.split(/\s+y\s+/i))
    .map((s) => s.trim())
    .filter(Boolean);

  const results: UbicacionChile[] = [];
  for (const seg of segments.length ? segments : [text]) {
    const parsed = parseSegment(seg);
    if (parsed && parsed.ciudad_comuna) results.push(parsed);
  }

  return results;
}

export function formatUbicacionShort(u: UbicacionChile): string {
  if (u.ciudad_comuna === "Todo Chile") return "Todo Chile";
  if (u.region) return `${u.ciudad_comuna}, ${u.region}`;
  return u.ciudad_comuna;
}

export function formatUbicacionCardSummary(ubicaciones: UbicacionChile[]): string {
  if (ubicaciones.length === 0) return "";
  const first = formatUbicacionShort(ubicaciones[0]);
  if (ubicaciones.length === 1) return first;
  return `${first} +${ubicaciones.length - 1}`;
}

export function parseUbicacionesJson(raw: unknown): UbicacionChile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const ciudad = typeof row.ciudad_comuna === "string" ? row.ciudad_comuna.trim() : "";
      const region = typeof row.region === "string" ? row.region.trim() : "";
      if (!ciudad) return null;
      return { ciudad_comuna: ciudad, region };
    })
    .filter((u): u is UbicacionChile => u !== null);
}

export function isTodoChile(ubicaciones: UbicacionChile[]): boolean {
  return ubicaciones.some(
    (u) => u.ciudad_comuna === "Todo Chile" && u.region === "Nacional"
  );
}
