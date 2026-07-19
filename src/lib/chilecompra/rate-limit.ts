function delayFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

/** Pausa entre consultas licitaciones.json?fecha= (evita 429). */
export const MP_LICITACION_DATE_DELAY_MS = delayFromEnv(
  "MP_LICITACION_DATE_DELAY_MS",
  700
);

/** Pausa entre busquedas Compra Agil por termino. */
export const MP_COMPRA_AGIL_TERM_DELAY_MS = delayFromEnv(
  "MP_COMPRA_AGIL_TERM_DELAY_MS",
  400
);

/** Horas hacia atrás en primera sync y cron nocturno (72 h). */
export const MP_INITIAL_SYNC_HOURS = delayFromEnv("MP_INITIAL_SYNC_HOURS", 72);

/** Dias calendario (Chile) en la primera sync de licitaciones por fecha. */
export const MP_INITIAL_SYNC_DAYS = delayFromEnv(
  "MP_INITIAL_SYNC_DAYS",
  Math.max(1, Math.ceil(MP_INITIAL_SYNC_HOURS / 24))
);

/** Horas minimas entre sync completa (evita re-escanear muchos items). */
export const MP_SYNC_COOLDOWN_HOURS = delayFromEnv("MP_SYNC_COOLDOWN_HOURS", 8);

/** Dias de solapamiento al sync incremental (recupera dias fallidos por 429). */
export const MP_SYNC_DATE_OVERLAP_DAYS = delayFromEnv("MP_SYNC_DATE_OVERLAP_DAYS", 2);

/** Ventana máxima de descubrimiento CA (alineada a 72 h). */
export const MP_CA_SYNC_DAYS = delayFromEnv(
  "MP_CA_SYNC_DAYS",
  Math.max(1, Math.ceil(MP_INITIAL_SYNC_HOURS / 24))
);

/** Solapamiento en sync incremental manual (horas). */
export const MP_SYNC_OVERLAP_HOURS = delayFromEnv("MP_SYNC_OVERLAP_HOURS", 2);

/** Páginas por keyword en Compra Ágil (GAS: 2 × 50 = 100). */
export const MP_CA_PAGES_PER_KEYWORD = delayFromEnv("MP_CA_PAGES_PER_KEYWORD", 2);

/** Keywords consultadas por request HTTP en fase CA. */
export const MP_CA_KEYWORDS_PER_BATCH = delayFromEnv("MP_CA_KEYWORDS_PER_BATCH", 8);

/** Tope de candidatos Compra Ágil por sync. */
export const MP_CA_CANDIDATE_MAX = delayFromEnv("MP_CA_CANDIDATE_MAX", 500);

/** Tope de candidatos licitación por sync. */
export const MP_LICITACION_CANDIDATE_MAX = delayFromEnv("MP_LICITACION_CANDIDATE_MAX", 300);
