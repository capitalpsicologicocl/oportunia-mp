/**
 * Montos en CLP: enteros en DB, formato solo en UI.
 * Detecta el bug de Sheets donde montos < $1M pierden un cero ($200.00 → $200.000).
 */

const SHEET_DECIMAL_BUG = /^\$\s*([\d.]+)\.(\d{2})$/;
const CLP_FORMATTED = /^\$\s*([\d.]+)$/;

export interface MontoParseResult {
  value: number | null;
  raw: string;
  suspicious: boolean;
  reason?: string;
}

export function parseDigitsOnly(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/** Parsea monto crudo de la API (número o string sin formato chileno). */
export function parseMontoFromApi(raw: string | number | null | undefined): MontoParseResult {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, raw: "", suspicious: false };
  }

  const rawStr = String(raw).trim();

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const intVal = Math.round(raw);
    return { value: intVal, raw: rawStr, suspicious: false };
  }

  const value = parseDigitsOnly(rawStr);
  return { value, raw: rawStr, suspicious: false };
}

/** Parsea montos exportados desde Google Sheets con heurística de bug. */
export function parseMontoFromSheet(formatted: string | null | undefined): MontoParseResult {
  if (!formatted?.trim()) {
    return { value: null, raw: "", suspicious: false };
  }

  const trimmed = formatted.trim();

  const decimalMatch = trimmed.match(SHEET_DECIMAL_BUG);
  if (decimalMatch) {
    const whole = decimalMatch[1].replace(/\./g, "");
    const cents = decimalMatch[2];
    if (cents === "00") {
      const corrected = Number(`${whole}000`);
      return {
        value: corrected,
        raw: trimmed,
        suspicious: true,
        reason: "Formato decimal en Sheet (.00) — probable pérdida de cero final",
      };
    }
  }

  const clpMatch = trimmed.match(CLP_FORMATTED);
  if (clpMatch) {
    const value = parseDigitsOnly(clpMatch[1]);
    return { value, raw: trimmed, suspicious: false };
  }

  const fallback = parseDigitsOnly(trimmed);
  return { value: fallback, raw: trimmed, suspicious: false };
}

/** Valida que el monto parseado sea coherente con el crudo de la API. */
export function validateMontoAgainstApi(
  parsed: number | null,
  rawApi: string | null | undefined
): boolean {
  if (parsed === null) return rawApi === null || rawApi === undefined || rawApi === "";
  const apiParsed = parseMontoFromApi(rawApi);
  if (apiParsed.value === null) return true;
  return parsed === apiParsed.value;
}

export function formatMontoCLP(value: number | null | undefined): string {
  if (value === null || value === undefined) return "No disponible";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Resuelve monto final priorizando API sobre Sheet si hay discrepancia. */
export function resolveMonto(
  sheetValue: string | null | undefined,
  apiValue: string | number | null | undefined
): MontoParseResult {
  const fromApi = parseMontoFromApi(apiValue);
  if (fromApi.value !== null) {
    const fromSheet = parseMontoFromSheet(sheetValue);
    if (fromSheet.suspicious && fromSheet.value !== fromApi.value) {
      return { ...fromApi, suspicious: false, reason: "Corregido con valor API" };
    }
    return fromApi;
  }
  return parseMontoFromSheet(sheetValue);
}
