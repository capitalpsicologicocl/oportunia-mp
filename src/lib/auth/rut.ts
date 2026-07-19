export function parseRutInput(input: string): { rut: string; rut_dv: string } | null {
  const clean = input.replace(/\./g, "").replace(/-/g, "").replace(/\s/g, "").toUpperCase();
  if (clean.length < 2) return null;
  const rut_dv = clean.slice(-1);
  const rut = clean.slice(0, -1).replace(/\D/g, "");
  if (!rut || !/^[0-9K]$/.test(rut_dv)) return null;
  return { rut, rut_dv };
}

export function formatRut(rut: string, dv: string): string {
  const body = rut.replace(/\D/g, "");
  if (body.length <= 3) return `${body}-${dv}`;
  const rev = body.split("").reverse();
  const parts: string[] = [];
  for (let i = 0; i < rev.length; i += 3) {
    parts.push(rev.slice(i, i + 3).reverse().join(""));
  }
  return `${parts.reverse().join(".")}-${dv.toUpperCase()}`;
}
