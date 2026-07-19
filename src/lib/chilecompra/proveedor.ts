import { resolveRubroUnspsc } from "@/lib/onboarding/rubros-unspsc";

const PROVEEDOR_BASE = "https://api.mercadopublico.cl/servicios/v1/Publico/Empresas";

export interface RubroSugerido {
  codigo_unspsc: string;
  nombre: string;
  sugerido_por_rut: boolean;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeRutInput(rut: string): { rut: string; dv: string } | null {
  const cleaned = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (cleaned.length < 2) return null;
  return { rut: cleaned.slice(0, -1), dv: cleaned.slice(-1) };
}

export async function fetchProveedorByRut(
  ticket: string,
  rutInput: string
): Promise<Record<string, unknown> | null> {
  const parsed = normalizeRutInput(rutInput);
  if (!parsed) return null;

  const url = `${PROVEEDOR_BASE}/BuscarProveedor?rutempresaproveedor=${parsed.rut}&dv=${parsed.dv}&ticket=${ticket}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, unknown>;
  return data;
}

export async function suggestRubrosFromRut(
  ticket: string,
  rutInput: string
): Promise<RubroSugerido[]> {
  const data = await fetchProveedorByRut(ticket, rutInput);
  if (!data) return [];

  const listado = (data.Listado ?? data.listado ?? data) as unknown;
  const items = Array.isArray(listado) ? listado : [listado];

  const rubros: RubroSugerido[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    const actividades = (record.Actividades ?? record.actividades ?? record.Rubros ?? record.rubros ?? []) as unknown[];
    const actList = Array.isArray(actividades) ? actividades : [actividades];

    for (const act of actList) {
      if (!act || typeof act !== "object") continue;
      const actRecord = act as Record<string, unknown>;
      const codigo = pickString(
        actRecord.Codigo,
        actRecord.codigo,
        actRecord.CodigoProducto,
        actRecord.codigoProducto
      );
      const nombre = pickString(
        actRecord.Nombre,
        actRecord.nombre,
        actRecord.Descripcion,
        actRecord.descripcion
      );
      if (!codigo || !nombre || seen.has(codigo)) continue;
      seen.add(codigo);
      rubros.push({ codigo_unspsc: resolveRubroUnspsc(codigo), nombre, sugerido_por_rut: true });
    }
  }

  return rubros;
}

export async function validateChilecompraTicket(ticket: string): Promise<boolean> {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const fecha = `${dd}${mm}${yyyy}`;

  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&ticket=${ticket}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return response.ok;
}
