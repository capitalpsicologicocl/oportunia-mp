/** Plantilla estructurada de análisis financiero para tarjetas CRM. */

export interface LineaConIva {
  valorUnitarioSinIva: number | null;
  ivaPct: number;
  cantidad: number | null;
  subtotal: number | null;
  detalleNotas: string | null;
  detalleProveedor: string | null;
}

export interface RelatoresLinea {
  valorHoraBruto: number | null;
  horasCurso: number | null;
  horasPreparacion: number | null;
  numRelatores: number | null;
  subtotal: number | null;
}

export interface ArriendoLinea {
  precioDiarioSinIva: number | null;
  ivaPct: number;
  numDias: number | null;
  total: number | null;
}

export interface ImpuestoLinea {
  tipo: "iva" | "ppm";
  porcentaje: number | null;
  monto: number | null;
}

export type ModoTrasladoLargo = "auto" | "avion" | "bus" | "tren" | "otro";
export type ModoTrasladoLocal = "metro" | "bus" | "taxi" | "app" | "otro";
export type TipoAlojamiento = "hotel" | "hostal" | "airbnb";

export interface DetalleTrasladoLargo {
  modo: ModoTrasladoLargo;
  detalle: string | null;
  monto: number | null;
}

export interface DetalleTrasladoLocal {
  modo: ModoTrasladoLocal;
  appNombre: string | null;
  monto: number | null;
}

export interface DetalleAlojamiento {
  tipo: TipoAlojamiento;
  nombre: string | null;
  direccion: string | null;
  web: string | null;
  monto: number | null;
}

export interface DetalleViatico {
  descripcion: string | null;
  desayuno: string | null;
  almuerzo: string | null;
  cena: string | null;
  monto: number | null;
}

export interface ItemTabla {
  descripcion: string;
  precioUnitario: number | null;
  cantidad: number | null;
  subtotal: number | null;
}

export interface TrasladoPersonasLinea {
  numPersonas: number | null;
  subtotal: number | null;
  detalles: DetalleTrasladoLargo[];
}

export interface TrasladoDiarioBase {
  numDias: number | null;
  numRelatores: number | null;
  subtotal: number | null;
}

export interface TrasladosLocalesLinea extends TrasladoDiarioBase {
  detalles: DetalleTrasladoLocal[];
}

export interface AlojamientoLinea extends TrasladoDiarioBase {
  detalles: DetalleAlojamiento[];
}

export interface ViaticosLinea extends TrasladoDiarioBase {
  detalles: DetalleViatico[];
}

export interface AnalisisFinancieroJson {
  relatores: RelatoresLinea;
  arriendo: ArriendoLinea;
  coffeeAm: LineaConIva;
  coffeePm: LineaConIva;
  almuerzo: LineaConIva;
  trasladoIda: TrasladoPersonasLinea;
  trasladoRegreso: TrasladoPersonasLinea;
  trasladosLocales: TrasladosLocalesLinea;
  alojamiento: AlojamientoLinea;
  viaticos: ViaticosLinea;
  materiales: ItemTabla[];
  otros: ItemTabla[];
  impuesto: ImpuestoLinea;
}

export const IVA_DEFAULT = 19;

export function emptyDetalleTrasladoLargo(): DetalleTrasladoLargo {
  return { modo: "bus", detalle: null, monto: null };
}

export function emptyDetalleTrasladoLocal(): DetalleTrasladoLocal {
  return { modo: "bus", appNombre: null, monto: null };
}

export function emptyDetalleAlojamiento(): DetalleAlojamiento {
  return { tipo: "hotel", nombre: null, direccion: null, web: null, monto: null };
}

export function emptyDetalleViatico(): DetalleViatico {
  return { descripcion: null, desayuno: null, almuerzo: null, cena: null, monto: null };
}

export function emptyItemTabla(): ItemTabla {
  return { descripcion: "", precioUnitario: null, cantidad: null, subtotal: null };
}

export function emptyTrasladoPersonas(): TrasladoPersonasLinea {
  return { numPersonas: null, subtotal: null, detalles: [emptyDetalleTrasladoLargo()] };
}

export function emptyTrasladoDiarioLocal(): TrasladosLocalesLinea {
  return { numDias: null, numRelatores: null, subtotal: null, detalles: [emptyDetalleTrasladoLocal()] };
}

export function emptyTrasladoDiarioAlojamiento(): AlojamientoLinea {
  return { numDias: null, numRelatores: null, subtotal: null, detalles: [emptyDetalleAlojamiento()] };
}

export function emptyTrasladoDiarioViaticos(): ViaticosLinea {
  return { numDias: null, numRelatores: null, subtotal: null, detalles: [emptyDetalleViatico()] };
}

export function emptyAnalisisFinanciero(): AnalisisFinancieroJson {
  return {
    relatores: {
      valorHoraBruto: null,
      horasCurso: null,
      horasPreparacion: null,
      numRelatores: null,
      subtotal: null,
    },
    arriendo: { precioDiarioSinIva: null, ivaPct: IVA_DEFAULT, numDias: null, total: null },
    coffeeAm: { valorUnitarioSinIva: null, ivaPct: IVA_DEFAULT, cantidad: null, subtotal: null, detalleNotas: null, detalleProveedor: null },
    coffeePm: { valorUnitarioSinIva: null, ivaPct: IVA_DEFAULT, cantidad: null, subtotal: null, detalleNotas: null, detalleProveedor: null },
    almuerzo: { valorUnitarioSinIva: null, ivaPct: IVA_DEFAULT, cantidad: null, subtotal: null, detalleNotas: null, detalleProveedor: null },
    trasladoIda: emptyTrasladoPersonas(),
    trasladoRegreso: emptyTrasladoPersonas(),
    trasladosLocales: emptyTrasladoDiarioLocal(),
    alojamiento: emptyTrasladoDiarioAlojamiento(),
    viaticos: emptyTrasladoDiarioViaticos(),
    materiales: [emptyItemTabla()],
    otros: [emptyItemTabla()],
    impuesto: { tipo: "iva", porcentaje: IVA_DEFAULT, monto: null },
  };
}

function n(value: number | null | undefined): number {
  return value ?? 0;
}

export function calcItemSubtotal(item: ItemTabla): number {
  return n(item.precioUnitario) * n(item.cantidad);
}

export function calcRelatoresSubtotal(r: RelatoresLinea): number {
  const horas = n(r.horasCurso) + n(r.horasPreparacion);
  return n(r.valorHoraBruto) * horas * Math.max(n(r.numRelatores), 1);
}

export function calcArriendoTotal(a: ArriendoLinea): number {
  const neto = n(a.precioDiarioSinIva) * n(a.numDias);
  return neto * (1 + n(a.ivaPct) / 100);
}

export function calcLineaConIvaSubtotal(l: LineaConIva): number {
  const neto = n(l.valorUnitarioSinIva) * n(l.cantidad);
  return neto * (1 + n(l.ivaPct) / 100);
}

export function calcTrasladoPersonasSubtotal(line: TrasladoPersonasLinea): number {
  const fromDetails = line.detalles.reduce((sum, d) => sum + n(d.monto), 0);
  const unit = fromDetails > 0 ? fromDetails : n(line.subtotal);
  const persons = Math.max(n(line.numPersonas), 1);
  return unit * persons;
}

export function calcTrasladoDiarioSubtotal(line: TrasladoDiarioBase & { detalles: Array<{ monto?: number | null }> }): number {
  const fromDetails = line.detalles.reduce((sum, d) => sum + n(d.monto), 0);
  if (fromDetails > 0) return fromDetails;
  return n(line.subtotal);
}

export function recalcularAnalisis(
  data: AnalisisFinancieroJson,
  montoOfertado: number | null
): AnalisisFinancieroJson {
  const next = structuredClone(data);
  next.relatores.subtotal = calcRelatoresSubtotal(next.relatores);
  next.arriendo.total = calcArriendoTotal(next.arriendo);
  next.coffeeAm.subtotal = calcLineaConIvaSubtotal(next.coffeeAm);
  next.coffeePm.subtotal = calcLineaConIvaSubtotal(next.coffeePm);
  next.almuerzo.subtotal = calcLineaConIvaSubtotal(next.almuerzo);
  next.trasladoIda.subtotal = calcTrasladoPersonasSubtotal(next.trasladoIda);
  next.trasladoRegreso.subtotal = calcTrasladoPersonasSubtotal(next.trasladoRegreso);
  next.trasladosLocales.subtotal = calcTrasladoDiarioSubtotal(next.trasladosLocales);
  next.alojamiento.subtotal = calcTrasladoDiarioSubtotal(next.alojamiento);
  next.viaticos.subtotal = calcTrasladoDiarioSubtotal(next.viaticos);
  next.materiales = next.materiales.map((i) => ({ ...i, subtotal: calcItemSubtotal(i) }));
  next.otros = next.otros.map((i) => ({ ...i, subtotal: calcItemSubtotal(i) }));

  if (next.impuesto.tipo === "iva") {
    next.impuesto.porcentaje = next.impuesto.porcentaje ?? IVA_DEFAULT;
    next.impuesto.monto = montoOfertado
      ? (montoOfertado * n(next.impuesto.porcentaje)) / (100 + n(next.impuesto.porcentaje))
      : null;
  } else {
    next.impuesto.monto = montoOfertado
      ? (montoOfertado * n(next.impuesto.porcentaje)) / 100
      : null;
  }

  return next;
}

export function totalCostos(data: AnalisisFinancieroJson): number {
  return (
    n(data.relatores.subtotal) +
    n(data.arriendo.total) +
    n(data.coffeeAm.subtotal) +
    n(data.coffeePm.subtotal) +
    n(data.almuerzo.subtotal) +
    n(data.trasladoIda.subtotal) +
    n(data.trasladoRegreso.subtotal) +
    n(data.trasladosLocales.subtotal) +
    n(data.alojamiento.subtotal) +
    n(data.viaticos.subtotal) +
    data.materiales.reduce((s, i) => s + n(i.subtotal), 0) +
    data.otros.reduce((s, i) => s + n(i.subtotal), 0) +
    n(data.impuesto.monto)
  );
}

export function ingresoNeto(montoOfertado: number | null, data: AnalisisFinancieroJson): number | null {
  if (montoOfertado == null) return null;
  return montoOfertado - totalCostos(data);
}

function mergeLinea<T extends object>(base: T, partial?: object): T {
  return partial ? { ...base, ...partial } : base;
}

export function parseAnalisisFinanciero(raw: unknown): AnalisisFinancieroJson {
  const base = emptyAnalisisFinanciero();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  const legacyPasajes = obj.pasajes as { monto?: number } | undefined;
  const legacyLocales = obj.trasladosLocales as { monto?: number } | undefined;

  return recalcularAnalisis(
    {
      ...base,
      relatores: mergeLinea(base.relatores, obj.relatores as object),
      arriendo: mergeLinea(base.arriendo, obj.arriendo as object),
      coffeeAm: mergeLinea(base.coffeeAm, obj.coffeeAm as object),
      coffeePm: mergeLinea(base.coffeePm, obj.coffeePm as object),
      almuerzo: mergeLinea(base.almuerzo, obj.almuerzo as object),
      trasladoIda: mergeLinea(base.trasladoIda, obj.trasladoIda as object),
      trasladoRegreso: mergeLinea(base.trasladoRegreso, obj.trasladoRegreso as object),
      trasladosLocales: mergeLinea(base.trasladosLocales, obj.trasladosLocales as object),
      alojamiento: mergeLinea(base.alojamiento, obj.alojamiento as object),
      viaticos: mergeLinea(base.viaticos, obj.viaticos as object),
      materiales: Array.isArray(obj.materiales) && obj.materiales.length ? (obj.materiales as ItemTabla[]) : base.materiales,
      otros: Array.isArray(obj.otros) && obj.otros.length ? (obj.otros as ItemTabla[]) : base.otros,
      impuesto: mergeLinea(base.impuesto, obj.impuesto as object),
    },
    null
  );
}

export const ESTADOS_INTERNOS = [
  "En análisis",
  "Go",
  "No-go",
  "En preparación PT",
  "Postulada",
  "Adjudicada",
  "No adjudicada",
] as const;

export type EstadoInterno = (typeof ESTADOS_INTERNOS)[number];

export interface CamposDescriptivosJson {
  numRelatores: number | null;
  numVersionesGrupos: number | null;
  relatores: Array<{
    nombre: string;
    especialidad: string | null;
    email: string | null;
    telefono: string | null;
  }>;
  modalidad: "presencial" | "elearning" | "mixta" | null;
  numParticipantes: number | null;
  duracionHoras: number | null;
}

export function emptyCamposDescriptivos(): CamposDescriptivosJson {
  return {
    numRelatores: null,
    numVersionesGrupos: null,
    relatores: [{ nombre: "", especialidad: null, email: null, telefono: null }],
    modalidad: null,
    numParticipantes: null,
    duracionHoras: null,
  };
}

export function parseCamposDescriptivos(raw: unknown): CamposDescriptivosJson {
  const base = emptyCamposDescriptivos();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<CamposDescriptivosJson>;
  return {
    ...base,
    ...obj,
    relatores: Array.isArray(obj.relatores) && obj.relatores.length ? obj.relatores : base.relatores,
  };
}
