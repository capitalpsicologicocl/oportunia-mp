/** Coincidencia familia UNSPSC (similar a filtro rubros en Mercado Público). */
export function unspscFamilyMatch(rubroCodigo: string, productoCodigo: string): boolean {
  const r = rubroCodigo.replace(/\D/g, "");
  const p = productoCodigo.replace(/\D/g, "");
  if (r.length < 4 || p.length < 4) return false;
  const segments = [8, 6, 4];
  for (const len of segments) {
    if (r.length >= len && p.length >= len && r.slice(0, len) === p.slice(0, len)) {
      return true;
    }
  }
  return false;
}

export function matchesRubrosUnspsc(
  productoCodigos: string[] | null | undefined,
  rubros: Array<{ codigo_unspsc: string }>
): boolean {
  if (!productoCodigos?.length || !rubros.length) return false;
  const numericRubros = rubros.filter((r) => /^\d{6,8}$/.test(r.codigo_unspsc.replace(/\D/g, "")));
  if (!numericRubros.length) return false;
  return productoCodigos.some((pc) =>
    numericRubros.some((r) => unspscFamilyMatch(r.codigo_unspsc, pc))
  );
}
