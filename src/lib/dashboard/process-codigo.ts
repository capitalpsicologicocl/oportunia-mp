/** Código externo típico de Mercado Público (ej. 3563-180-COT26, 898-141-LE26). */
export function looksLikeProcessCodigo(value: string): boolean {
  return /^\d+-\d+-[A-Z0-9]+$/i.test(value.trim());
}
