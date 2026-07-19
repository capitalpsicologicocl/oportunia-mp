import { computeContentHash } from "@/lib/content-hash";
import { MP_COMPRA_AGIL_TERM_DELAY_MS } from "@/lib/chilecompra/rate-limit";
import { parseMontoFromApi } from "@/lib/montos";
import type { ProcessTipo } from "@/types/database";

const LICITACIONES_BASE = "https://api.mercadopublico.cl/servicios/v1/publico";
const COMPRA_AGIL_BASE =
  process.env.CHILECOMPRA_API2_BASE_URL ?? "https://api2.mercadopublico.cl";

export interface NormalizedProcess {
  codigo_externo: string;
  tipo: ProcessTipo;
  estado: string | null;
  nombre: string;
  descripcion: string | null;
  tipo_detalle: string | null;
  monto_estimado: number | null;
  monto_raw_api: string | null;
  monto_sospechoso: boolean;
  organismo_nombre: string | null;
  organismo_rut: string | null;
  unidad_compra: string | null;
  lugar_ejecucion: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  fecha_cierre_2: string | null;
  hora_cierre: string | null;
  hora_publicacion: string | null;
  hora_cierre_2: string | null;
  servicios_requeridos: string | null;
  url_publica: string | null;
  adjudicado_rut: string | null;
  adjudicado_nombre: string | null;
  rubros_unspsc: string[];
  content_hash: string;
}

async function sleepMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_HTTP = new Set([429, 502, 503, 504]);

async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  label: string
): Promise<Response> {
  const waits = [0, 2000, 5000, 10000, 15000];
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt] > 0) await sleepMs(waits[attempt]);
    const response = await doFetch();
    if (!RETRYABLE_HTTP.has(response.status)) return response;
  }

  if (label.includes("compra-agil")) {
    throw new Error(`ChileCompra API2: servicio no respondió (${label}), reintenta más tarde`);
  }
  throw new Error(`ChileCompra API: cuota o timeout (${label})`);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetchWithRetry(
    () =>
      fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      }),
    "licitaciones"
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`ChileCompra API ${response.status}: licitaciones`);
  }

  return response.json() as Promise<T>;
}

async function fetchApi2<T>(
  path: string,
  ticket: string,
  params?: Record<string, string | number>
): Promise<T | null> {
  const url = new URL(path, COMPRA_AGIL_BASE);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetchWithRetry(
    () =>
      fetch(url.toString(), {
        headers: { Accept: "application/json", ticket },
        next: { revalidate: 0 },
      }),
    path.includes("compra-agil") ? `compra-agil ${path}` : path
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`ChileCompra API2 ${response.status}: compra-agil`);
  }

  const data = (await response.json()) as { payload?: T } & Partial<T>;
  return (data.payload ?? data) as T;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseApiDate(value: unknown): string | null {
  const str = pickString(value);
  if (!str) return null;
  const slash = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) {
    return new Date(`${slash[3]}-${slash[2]}-${slash[1]}T12:00:00.000Z`).toISOString();
  }
  const match = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00.000Z`).toISOString();
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeHora(value: unknown): string | null {
  const str = pickString(value);
  if (!str) return null;
  const hm = str.match(/^(\d{1,2}):(\d{2})/);
  if (hm) {
    const h = hm[1].padStart(2, "0");
    return `${h}:${hm[2]}`;
  }
  return null;
}

function extractMonto(raw: unknown): { value: number | null; raw: string | null; suspicious: boolean } {
  if (raw === null || raw === undefined) {
    return { value: null, raw: null, suspicious: false };
  }
  const parsed = parseMontoFromApi(raw as string | number);
  return { value: parsed.value, raw: parsed.raw, suspicious: parsed.suspicious ?? false };
}

function ddMmYyyyToIso(fecha: string): string {
  const dd = fecha.slice(0, 2);
  const mm = fecha.slice(2, 4);
  const yyyy = fecha.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

/** Fecha calendario en Chile (YYYY-MM-DD) para APIs. */
export function chileDateIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Códigos de estado en listados diarios de licitaciones (CodigoEstado). */
const LICITACION_ESTADO_BY_CODIGO: Record<number, string> = {
  5: "Publicada",
  6: "Cerrada",
  7: "Desierta",
  8: "Adjudicada",
  9: "Cancelada",
  10: "Suspendida",
  11: "Revocada",
  13: "Cerrada",
  14: "OC Emitida",
  15: "En Evaluación",
};

function normalizeEstadoLicitacion(item: Record<string, unknown>): string | null {
  const fromString = pickString(item.Estado, item.estado, item.EstadoMP, item.estadoMp);
  if (fromString) return fromString;

  const nested = item.Estado ?? item.estado;
  if (nested && typeof nested === "object") {
    const glosa = extractEstado({ estado: nested });
    if (glosa) return glosa;
  }

  const codigoEstado =
    typeof item.CodigoEstado === "number"
      ? item.CodigoEstado
      : typeof item.codigoEstado === "number"
        ? item.codigoEstado
        : null;

  if (codigoEstado != null) {
    return LICITACION_ESTADO_BY_CODIGO[codigoEstado] ?? `Estado ${codigoEstado}`;
  }

  return null;
}

function convocatoriaObject(item: Record<string, unknown>): Record<string, unknown> {
  const raw = item.convocatoria ?? item.Convocatoria;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function horaEnChile(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function splitFechaHora(value: unknown): { fecha: string | null; hora: string | null } {
  const str = pickString(value);
  if (!str) return { fecha: null, hora: null };

  const slashDateTime = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (slashDateTime) {
    const h = slashDateTime[4].padStart(2, "0");
    return {
      fecha: new Date(
        `${slashDateTime[3]}-${slashDateTime[2]}-${slashDateTime[1]}T12:00:00.000Z`
      ).toISOString(),
      hora: `${h}:${slashDateTime[5]}`,
    };
  }

  const isoSpace = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (isoSpace) {
    const h = isoSpace[4].padStart(2, "0");
    return {
      fecha: new Date(`${isoSpace[1]}-${isoSpace[2]}-${isoSpace[3]}T12:00:00.000Z`).toISOString(),
      hora: `${h}:${isoSpace[5]}`,
    };
  }

  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        fecha: parsed.toISOString(),
        hora: horaEnChile(parsed.toISOString()) ?? `${isoMatch[2]}:${isoMatch[3]}`,
      };
    }
  }

  return { fecha: parseApiDate(str), hora: null };
}

function parseLicitacionCierre(value: unknown): { fecha: string | null; hora: string | null } {
  return splitFechaHora(value);
}

function isProveedorSeleccionado(proveedor: Record<string, unknown>): boolean {
  if (proveedor.proveedor_seleccionado === true || proveedor.proveedor_seleccionado === 1) {
    return true;
  }
  const seleccion = proveedor.seleccion as Record<string, unknown> | undefined;
  return seleccion?.proveedor_seleccionado === true || seleccion?.proveedor_seleccionado === 1;
}

function extractProveedorSeleccionado(item: Record<string, unknown>): {
  rut: string | null;
  nombre: string | null;
} {
  const proveedores = item.proveedores_cotizando ?? item.ProveedoresCotizando;
  if (Array.isArray(proveedores)) {
    const selected = proveedores.find((p) =>
      isProveedorSeleccionado(p as Record<string, unknown>)
    ) as Record<string, unknown> | undefined;
    if (selected) {
      return {
        rut: pickString(selected.rut_proveedor, selected.rutProveedor),
        nombre: pickString(selected.razon_social, selected.razonSocial),
      };
    }
  }

  const adjudicacion = (item.adjudicacion ?? item.Adjudicacion ?? {}) as Record<string, unknown>;
  return {
    rut: pickString(adjudicacion.rutProveedor, adjudicacion.rut_proveedor),
    nombre: pickString(adjudicacion.nombreProveedor, adjudicacion.razon_social),
  };
}

function extractEstado(item: Record<string, unknown>): string | null {
  const estado = item.estado ?? item.Estado;
  if (typeof estado === "string") return estado;
  if (estado && typeof estado === "object") {
    const nested = estado as Record<string, unknown>;
    return pickString(nested.glosa, nested.Glosa, nested.codigo, nested.Codigo);
  }
  return null;
}

function extractUnspscFromItem(item: Record<string, unknown>): string[] {
  const productos = item.productos ?? item.Productos ?? item.productos_solicitados;
  if (!Array.isArray(productos)) return [];
  const codes = new Set<string>();
  for (const raw of productos) {
    const p = raw as Record<string, unknown>;
    const code = pickString(
      p.codigoProducto,
      p.codigo_producto,
      p.CodigoProducto,
      p.idCategoria,
      p.IdCategoria,
      p.codigoCategoria,
      p.CodigoCategoria
    );
    if (code) codes.add(code.replace(/\D/g, ""));
  }
  return [...codes].filter((c) => c.length >= 4);
}

function extractProductosResumen(item: Record<string, unknown>): string | null {
  const productos =
    item.productos ?? item.productos_solicitados ?? item.ProductosSolicitados ?? item.Productos;
  if (!Array.isArray(productos) || productos.length === 0) {
    return pickString(item.productos, item.Productos, item.detalleProductos);
  }
  const nombres = productos
    .map((p) => pickString((p as Record<string, unknown>).nombre, (p as Record<string, unknown>).Nombre))
    .filter(Boolean);
  return nombres.length ? nombres.join("; ") : null;
}

export async function fetchLicitacionesByFecha(ticket: string, fecha: string) {
  const url = `${LICITACIONES_BASE}/licitaciones.json?fecha=${fecha}&ticket=${ticket}`;
  const data = await fetchJson<{ Listado?: unknown[]; listado?: unknown[] }>(url);
  return data?.Listado ?? data?.listado ?? [];
}

export async function fetchLicitacionByCodigo(ticket: string, codigo: string) {
  const url = `${LICITACIONES_BASE}/licitaciones.json?codigo=${encodeURIComponent(codigo)}&ticket=${ticket}`;
  const data = await fetchJson<{ Listado?: unknown[]; listado?: unknown[] }>(url);
  const list = data?.Listado ?? data?.listado ?? [];
  return list[0] ?? null;
}

export async function fetchCompraAgilByFecha(ticket: string, fecha: string) {
  const iso = ddMmYyyyToIso(fecha);
  return fetchCompraAgilRange(ticket, iso, iso);
}

interface CompraAgilListResponse {
  items?: unknown[];
  Items?: unknown[];
  paginacion?: { total_paginas?: number; numero_pagina?: number };
}

export async function fetchCompraAgilByQuery(
  ticket: string,
  q: string,
  maxPages = 4,
  options?: { publicadoDesde?: string; estado?: string }
): Promise<unknown[]> {
  const query = stripAccents(q).trim().toLowerCase();
  if (query.length < 3) return [];

  const items: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const params: Record<string, string | number> = {
      q: query,
      tamano_pagina: 50,
      numero_pagina: page,
      ordenar_por: "FechaPublicacion",
    };
    if (options?.publicadoDesde) params.publicado_desde = options.publicadoDesde;
    if (options?.estado) params.estado = options.estado;

    const data = await fetchApi2<CompraAgilListResponse>("/v2/compra-agil", ticket, params);

    const pageItems = data?.items ?? data?.Items ?? [];
    items.push(...pageItems);
    totalPages = Math.max(1, data?.paginacion?.total_paginas ?? 1);
    if (pageItems.length === 0) break;
    page += 1;
    if (page <= totalPages && page <= maxPages) {
      await sleepMs(MP_COMPRA_AGIL_TERM_DELAY_MS);
    }
  }

  return items;
}

/** Listado reciente sin keyword (si la API lo permite). */
export async function fetchCompraAgilPublishedSince(
  ticket: string,
  publicadoDesdeIso: string,
  maxPages = 6
): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    try {
      const data = await fetchApi2<CompraAgilListResponse>("/v2/compra-agil", ticket, {
        publicado_desde: publicadoDesdeIso,
        tamano_pagina: 50,
        numero_pagina: page,
      });
      const pageItems = data?.items ?? data?.Items ?? [];
      if (pageItems.length === 0 && page === 1) {
        break;
      }
      items.push(...pageItems);
      totalPages = Math.max(1, data?.paginacion?.total_paginas ?? 1);
      if (pageItems.length === 0) break;
      page += 1;
      await sleepMs(MP_COMPRA_AGIL_TERM_DELAY_MS);
    } catch {
      break;
    }
  }

  return items;
}

export async function fetchCompraAgilForTerms(
  ticket: string,
  terms: string[],
  maxPagesPerTerm = 2,
  options?: { startIndex?: number; batchSize?: number; publicadoDesde?: string }
): Promise<NormalizedProcess[]> {
  const seen = new Set<string>();
  const results: NormalizedProcess[] = [];
  const unique = [
    ...new Set(
      terms
        .map((term) => stripAccents(term).trim().toLowerCase())
        .filter((term) => term.length >= 3)
    ),
  ];

  const start = options?.startIndex ?? 0;
  const batchSize = options?.batchSize ?? unique.length;
  const batch = unique.slice(start, start + batchSize);
  const queryOptions = {
    publicadoDesde: options?.publicadoDesde,
    estado: "publicada",
  };

  for (const term of batch) {
    try {
      const rawItems = await fetchCompraAgilByQuery(
        ticket,
        term,
        maxPagesPerTerm,
        queryOptions
      );
      for (const raw of rawItems) {
        const normalized = normalizeCompraAgil(raw);
        if (!seen.has(normalized.codigo_externo)) {
          seen.add(normalized.codigo_externo);
          results.push(normalized);
        }
      }
    } catch {
      // omitir términos que fallen
    }
    await sleepMs(MP_COMPRA_AGIL_TERM_DELAY_MS);
  }

  return results;
}

/** @deprecated La API exige al menos q o id; usar fetchCompraAgilForTerms. */
export async function fetchCompraAgilRange(ticket: string, desdeIso: string, hastaIso: string) {
  void ticket;
  void desdeIso;
  void hastaIso;
  return [];
}

export async function fetchCompraAgilByCodigo(ticket: string, codigo: string) {
  return fetchApi2<Record<string, unknown>>(
    `/v2/compra-agil/${encodeURIComponent(codigo)}`,
    ticket
  );
}

export function normalizeLicitacion(raw: unknown): NormalizedProcess {
  const item = raw as Record<string, Record<string, unknown> | unknown>;
  const comprador = (item.Comprador ?? item.comprador ?? {}) as Record<string, unknown>;
  const montoRaw =
    item.MontoEstimado ?? item.montoEstimado ?? item.Monto ?? item.monto ?? null;
  const monto = extractMonto(montoRaw);

  const adjudicacion = (item.Adjudicacion ?? item.adjudicacion ?? {}) as Record<string, unknown>;
  const adjudicado = (adjudicacion.Adjudicado ?? adjudicacion.adjudicado ?? {}) as Record<
    string,
    unknown
  >;

  const codigo = pickString(item.CodigoExterno, item.codigoExterno, item.Codigo, item.codigo)!;
  const nombre = pickString(item.Nombre, item.nombre) ?? codigo;
  const descripcion = pickString(item.Descripcion, item.descripcion);
  const estado = normalizeEstadoLicitacion(item as Record<string, unknown>);
  const fechas = (item.Fechas ?? item.fechas ?? {}) as Record<string, unknown>;
  const items = (item.Items ?? item.items ?? {}) as Record<string, unknown>;
  const cierreRoot = parseLicitacionCierre(
    fechas.FechaCierre ??
      fechas.fechaCierre ??
      fechas.Cierre ??
      fechas.cierre ??
      item.FechaCierre ??
      item.fechaCierre
  );
  const publicacionRaw =
    fechas.FechaPublicacion ??
    fechas.fechaPublicacion ??
    fechas.Publicacion ??
    fechas.publicacion ??
    item.FechaPublicacion ??
    item.fechaPublicacion;
  const publicacionParsed = parseLicitacionCierre(publicacionRaw);

  return {
    codigo_externo: codigo,
    tipo: "licitacion",
    estado,
    nombre,
    descripcion,
    tipo_detalle: pickString(item.Tipo, item.tipo, item.TipoLicitacion, item.tipoLicitacion),
    monto_estimado: monto.value,
    monto_raw_api: monto.raw,
    monto_sospechoso: monto.suspicious,
    organismo_nombre: pickString(comprador.NombreOrganismo, comprador.nombreOrganismo),
    organismo_rut: pickString(comprador.RutUnidad, comprador.rutUnidad),
    unidad_compra: pickString(comprador.NombreUnidad, comprador.nombreUnidad),
    lugar_ejecucion: pickString(
      comprador.RegionUnidad,
      comprador.regionUnidad,
      comprador.ComunaUnidad,
      comprador.comunaUnidad
    ),
    fecha_publicacion: publicacionParsed.fecha ?? parseApiDate(publicacionRaw),
    fecha_cierre: cierreRoot.fecha,
    fecha_cierre_2: null,
    hora_publicacion:
      normalizeHora(
        fechas.HoraPublicacion ??
          fechas.horaPublicacion ??
          item.HoraPublicacion ??
          item.horaPublicacion
      ) ?? publicacionParsed.hora,
    hora_cierre:
      pickString(
        fechas.HoraCierre,
        fechas.horaCierre,
        item.HoraCierre,
        item.horaCierre
      ) ?? cierreRoot.hora,
    hora_cierre_2: null,
    servicios_requeridos: pickString(items.Listado, items.listado, item.Descripcion),
    url_publica: `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${codigo}`,
    adjudicado_rut: pickString(adjudicado.RutProveedor, adjudicado.rutProveedor),
    adjudicado_nombre: pickString(adjudicado.NombreProveedor, adjudicado.nombreProveedor),
    rubros_unspsc: extractUnspscFromItem(item as Record<string, unknown>),
    content_hash: computeContentHash([nombre, descripcion, estado, monto.raw]),
  };
}

export function normalizeCompraAgil(raw: unknown): NormalizedProcess {
  const item = raw as Record<string, Record<string, unknown> | unknown>;
  const institucion = (item.institucion ??
    item.Institucion ??
    item.organismo ??
    item.Organismo ??
    {}) as Record<string, unknown>;
  const presupuesto = (item.presupuesto ?? item.Presupuesto ?? {}) as Record<string, unknown>;
  const montos = (item.montos ?? item.Montos ?? {}) as Record<string, unknown>;
  const fechas = (item.fechas ?? item.Fechas ?? {}) as Record<string, unknown>;
  const convocatoria = convocatoriaObject(item as Record<string, unknown>);

  const montoRaw =
    item.monto_disponible ??
    item.montoDisponible ??
    presupuesto.monto_disponible_clp ??
    presupuesto.monto_disponible ??
    montos.monto_disponible_clp ??
    montos.monto_disponible ??
    item.MontoDisponible ??
    item.montoTotal ??
    item.MontoTotal ??
    null;
  const monto = extractMonto(montoRaw);

  const codigo = pickString(item.codigo, item.Codigo, item.codigoCot, item.CodigoCOT)!;
  const nombre = pickString(item.nombre, item.Nombre) ?? codigo;
  const descripcion = pickString(item.descripcion, item.Descripcion);
  const estado = extractEstado(item);
  const proveedor = extractProveedorSeleccionado(item);

  const publicacionRaw =
    item.fecha_publicacion ??
    item.fecha_apertura ??
    item.FechaPublicacion ??
    item.fechaPublicacion ??
    fechas.fecha_publicacion ??
    fechas.FechaPublicacion;
  const publicacionParts = splitFechaHora(publicacionRaw);

  const cierreRaw =
    item.fecha_cierre_primer_llamado ??
    item.FechaCierrePrimerLlamado ??
    item.fecha_cierre ??
    item.FechaCierre ??
    item.fechaCierre ??
    item.fechaCierrePrimerLlamado ??
    convocatoria.fecha_cierre_primer_llamado ??
    convocatoria.FechaCierrePrimerLlamado ??
    fechas.fecha_cierre ??
    fechas.FechaCierre;
  const cierreParts = splitFechaHora(cierreRaw);

  const cierre2Raw =
    item.fecha_cierre_segundo_llamado ??
    item.FechaCierreSegundoLlamado ??
    item.fechaCierreSegundoLlamado ??
    convocatoria.fecha_cierre_segundo_llamado ??
    convocatoria.FechaCierreSegundoLlamado;
  const cierre2Parts = splitFechaHora(cierre2Raw);

  return {
    codigo_externo: codigo,
    tipo: "compra_agil",
    estado,
    nombre,
    descripcion,
    tipo_detalle: "Compra Ágil",
    monto_estimado: monto.value,
    monto_raw_api: monto.raw,
    monto_sospechoso: monto.suspicious,
    organismo_nombre: pickString(
      item.organismo,
      item.Organismo,
      institucion.organismo_comprador,
      institucion.OrganismoComprador,
      institucion.nombre,
      institucion.Nombre,
      item.institucion_empresa
    ),
    organismo_rut: pickString(
      item.institucion_rut,
      institucion.rut,
      institucion.Rut
    ),
    unidad_compra: pickString(
      item.unidad,
      item.Unidad,
      item.institucion_organizacion,
      institucion.unidad_compra,
      institucion.UnidadCompra,
      institucion.unidad,
      institucion.Unidad
    ),
    lugar_ejecucion: pickString(
      item.direccion,
      item.region,
      item.comuna,
      institucion.nombre_region,
      institucion.NombreRegion,
      institucion.comuna,
      institucion.Comuna,
      institucion.region,
      institucion.Region
    ),
    fecha_publicacion: publicacionParts.fecha ?? parseApiDate(publicacionRaw),
    fecha_cierre: cierreParts.fecha ?? parseApiDate(cierreRaw),
    fecha_cierre_2: cierre2Parts.fecha ?? parseApiDate(cierre2Raw),
    hora_publicacion:
      normalizeHora(
        fechas.hora_publicacion ??
          fechas.HoraPublicacion ??
          item.horaPublicacion ??
          item.HoraPublicacion
      ) ?? publicacionParts.hora,
    hora_cierre:
      normalizeHora(
        convocatoria.hora_cierre_primer_llamado ??
          convocatoria.HoraCierrePrimerLlamado ??
          fechas.hora_cierre ??
          fechas.HoraCierre ??
          item.horaCierre ??
          item.HoraCierre
      ) ?? cierreParts.hora,
    hora_cierre_2:
      normalizeHora(
        convocatoria.hora_cierre_segundo_llamado ??
          convocatoria.HoraCierreSegundoLlamado ??
          item.horaCierreSegundoLlamado ??
          item.HoraCierreSegundoLlamado
      ) ?? cierre2Parts.hora,
    servicios_requeridos: extractProductosResumen(item),
    url_publica: `https://buscador.mercadopublico.cl/ficha?code=${codigo}`,
    adjudicado_rut: proveedor.rut,
    adjudicado_nombre: proveedor.nombre,
    rubros_unspsc: extractUnspscFromItem(item as Record<string, unknown>),
    content_hash: computeContentHash([
      nombre,
      descripcion,
      estado,
      monto.raw,
      proveedor.rut,
      proveedor.nombre,
    ]),
  };
}

export function inferProcessTipo(codigo: string): ProcessTipo {
  return /COT/i.test(codigo) ? "compra_agil" : "licitacion";
}
