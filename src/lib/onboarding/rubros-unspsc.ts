/**
 * Mapeo rubros comerciales de Mercado Público → códigos UNSPSC (familia 8 dígitos).
 * MP no expone UNSPSC en el perfil del proveedor vía API; este mapa cierra la brecha.
 */
export const MP_RUBRO_TO_UNSPSC: Record<string, string> = {
  "mp-consultoria-gestion-empresas": "80101500",
  "mp-gestion-proyectos": "80101500",
  "mp-consultoria-rrhh": "80101600",
  "mp-ventas-marketing": "80111500",
  "mp-gerencial-salud": "80101500",
  "mp-formacion-cientifica": "86101600",
  "mp-formacion-no-cientifica": "86101500",
  "mp-desarrollo-rrhh": "86101800",
  "mp-aprendizaje-distancia": "86101700",
  "mp-educacion-adultos": "86101500",
  "mp-consultoria": "80101500",
  "mp-planificacion-factibilidad": "80101900",
};

export function isNumericUnspsc(codigo: string): boolean {
  return /^\d{6,8}$/.test(codigo.replace(/\D/g, "")) && codigo.replace(/\D/g, "").length >= 6;
}

/** Resuelve pseudo-códigos mp-* al UNSPSC equivalente. */
export function resolveRubroUnspsc(codigo: string): string {
  const trimmed = codigo.trim();
  if (isNumericUnspsc(trimmed)) {
    return trimmed.replace(/\D/g, "").slice(0, 8);
  }
  return MP_RUBRO_TO_UNSPSC[trimmed] ?? trimmed;
}

export type OrgRubro = { codigo_unspsc: string; nombre: string };

/** Normaliza rubros de org para matching UNSPSC + texto. */
export function normalizeOrgRubros(
  rubros: OrgRubro[]
): Array<{ codigo_unspsc: string; nombre: string }> {
  return rubros.map((r) => ({
    codigo_unspsc: resolveRubroUnspsc(r.codigo_unspsc),
    nombre: r.nombre,
  }));
}

/** Códigos UNSPSC únicos (solo numéricos) para matching de familia. */
export function unspscCodesForMatching(
  rubros: Array<{ codigo_unspsc?: string; nombre?: string }>
): Array<{ codigo_unspsc: string }> {
  const codes = new Set<string>();
  for (const r of rubros) {
    if (!r.codigo_unspsc) continue;
    const resolved = resolveRubroUnspsc(r.codigo_unspsc);
    if (isNumericUnspsc(resolved)) codes.add(resolved);
  }
  return [...codes].map((codigo_unspsc) => ({ codigo_unspsc }));
}

/** Palabras de búsqueda útiles extraídas de nombres de rubro (prioridad en sync CA). */
const RUBRO_STOPWORDS = new Set([
  "servicios",
  "servicio",
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "en",
  "para",
  "y",
  "a",
  "con",
]);

export function extractRubroSearchTerms(rubros: Array<{ nombre: string }>): string[] {
  const terms = new Set<string>();
  for (const rubro of rubros) {
    const full = rubro.nombre.trim().toLowerCase();
    if (full.length >= 4 && full.length <= 48) terms.add(full);
    for (const word of full.split(/\s+/)) {
      const w = word.replace(/[^a-záéíóúñ0-9-]/gi, "");
      if (w.length >= 5 && !RUBRO_STOPWORDS.has(w)) terms.add(w);
    }
  }
  return [...terms];
}
