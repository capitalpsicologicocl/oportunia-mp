import { stripAccents } from "@/lib/chilecompra/client";

/** Palabras de exclusión (paridad GAS v8 — Capital Psicológico). */
export const EXCLUSION_KEYWORDS = [
  "construccion",
  "construcción",
  "obra civil",
  "obras civiles",
  "pavimentacion",
  "pavimentación",
  "remodelacion",
  "remodelación",
  "instalacion electrica",
  "instalación eléctrica",
  "farmaco",
  "fármaco",
  "farmacos",
  "fármacos",
  "medicamento",
  "insumo clinico",
  "insumo clínico",
  "implante",
  "protesis",
  "prótesis",
  "quirurgico",
  "quirúrgico",
  "coclear",
  "oftalmolog",
  "mobiliario",
  "maquinaria",
  "vehiculo",
  "vehículo",
  "vehiculos",
  "vehículos",
  "camion",
  "camión",
  "ascensor",
  "calefon",
  "calefón",
  "tobogan",
  "tobogán",
  "soldadora",
  "herramienta",
  "extintor",
  "alimento",
  "alimentos",
  "catering",
  "coffee break",
  "colacion",
  "colación",
  "cocina",
  "gastronomia",
  "gastronomía",
  "reposteria",
  "repostería",
  "bebestible",
  "vestuario",
  "uniforme",
  "ropa",
  "calzado",
  "regalo",
  "gift card",
  "galvano",
  "poda",
  "jardineria",
  "jardinería",
  "botanica",
  "botánica",
  "lubricante",
  "pintura acrilica",
  "artesania",
  "artesanía",
  "implemento deportivo",
  "material deportivo",
  "taller de cocina",
  "taller de karate",
  "taller de telar",
  "taller de madera",
  "taller de barberia",
  "taller de barbería",
  "taller de costura",
  "taller de artes",
  "taller de resina",
  "taller de marroquineria",
  "taller de marroquinería",
  "taller gastronomic",
  "taller fomento lector",
  "taller de cesteria",
  "taller de vino",
  "transporte de pasajeros",
  "servicio de traslado",
  "conductor profesional",
  "licencia de conducir",
  "electricidad",
  "electrica",
  "eléctrica",
  "bienestar de carabineros",
  "bienestar social",
  "zona de bienestar",
  "division de bienestar",
  "servicio de bienestar",
  "oficina de bienestar",
  "protecciones metalicas",
  "protecciones metálicas",
  "cejas",
  "visagismo",
  "vulcanizacion",
  "vulcanización",
  "neumaticos",
  "neumáticos",
  "poliuretano",
  "aislacion",
  "aislamiento",
  "cielo falso",
  "acustico",
  "acústico",
  "fibra mineral",
  "losa radiante",
  "hormigon",
  "hormigón",
  "fierro",
  "carton yeso",
  "cartón yeso",
  "soporte monitor",
  "soportes para monitor",
  "soportes de monitor",
  "monitor lcd",
  "monitores o pantallas",
  "pantallas de visualizacion",
  "pantallas de visualización",
] as const;

export function normalizeMatchText(text: string): string {
  return stripAccents(text).toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Keywords cortas (curso, taller…) exigen palabra completa para evitar falsos positivos. */
export function keywordMatchesInText(text: string, keyword: string): boolean {
  const normalizedText = normalizeMatchText(text);
  const normalizedKw = normalizeMatchText(keyword.trim());
  if (normalizedKw.length < 3) return false;
  if (normalizedKw.length <= 5) {
    const re = new RegExp(`(?:^|[\\s,;(/\\-])${escapeRegex(normalizedKw)}(?:$|[\\s,;)/\\-])`);
    return re.test(` ${normalizedText} `);
  }
  return normalizedText.includes(normalizedKw);
}

/** Palabras del template que solas arrastran CA de otro rubro (sensores, fumigación, TI). */
const AMBIGUOUS_KEYWORDS = new Set([
  "monitoreo",
  "diagnostico",
  "certificacion",
  "jornada",
  "competencias",
  "metodologia",
  "facilitacion",
  "transcripcion",
  "implementacion",
  "sistema",
]);

const NICHE_CONTEXT = [
  "capacitacion",
  "curso",
  "taller",
  "formacion",
  "coaching",
  "consultoria",
  "liderazgo",
  "bienestar",
  "otec",
  "sence",
  "aprendizaje",
  "induccion",
  "psicoeducacion",
  "clima laboral",
  "recursos humanos",
  "rrhh",
  "habilidades blandas",
  "desarrollo organizacional",
];

export function isAmbiguousKeyword(keyword: string): boolean {
  return AMBIGUOUS_KEYWORDS.has(normalizeMatchText(keyword.trim()));
}

function hasNicheContext(text: string): boolean {
  const normalized = normalizeMatchText(text);
  return NICHE_CONTEXT.some((stem) => normalized.includes(stem));
}

export function isExcluded(text: string): boolean {
  const normalized = normalizeMatchText(text);
  return EXCLUSION_KEYWORDS.some((ex) => normalized.includes(normalizeMatchText(ex)));
}

export function matchesInclusionKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const coreHit = keywords.some((kw) => !isAmbiguousKeyword(kw) && keywordMatchesInText(text, kw));
  if (coreHit) return true;
  const ambiguousHit = keywords.some((kw) => isAmbiguousKeyword(kw) && keywordMatchesInText(text, kw));
  return ambiguousHit && hasNicheContext(text);
}

/** Paridad GAS: keyword activa en el texto y sin exclusiones. */
export function textoCorresponde(text: string, keywords: string[]): boolean {
  const normalized = normalizeMatchText(text);
  if (isExcluded(normalized)) return false;
  return matchesInclusionKeywords(normalized, keywords);
}
