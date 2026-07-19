"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AnalisisFinancieroJson,
  IVA_DEFAULT,
  emptyDetalleAlojamiento,
  emptyDetalleCoffee,
  emptyDetalleTrasladoLocal,
  emptyDetalleTrasladoLargo,
  emptyDetalleViatico,
  emptyItemTabla,
  ingresoNeto,
  recalcularAnalisis,
  totalCostos,
} from "@/lib/kanban/financial-analysis";
import { formatMontoCLP } from "@/lib/montos";
import { ExternalLink } from "lucide-react";

const MODO_TRASLADO_LARGO: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "avion", label: "Avión" },
  { value: "bus", label: "Bus" },
  { value: "tren", label: "Tren" },
  { value: "otro", label: "Otro" },
];

const MODO_TRASLADO_LOCAL: Array<{ value: string; label: string }> = [
  { value: "metro", label: "Metro" },
  { value: "bus", label: "Bus" },
  { value: "taxi", label: "Taxi" },
  { value: "app", label: "Aplicación" },
  { value: "otro", label: "Otro" },
];

const TIPO_ALOJAMIENTO: Array<{ value: string; label: string }> = [
  { value: "hotel", label: "Hotel" },
  { value: "hostal", label: "Hostal" },
  { value: "airbnb", label: "Airbnb" },
];

function DetailSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-background p-4 shadow-xl sm:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-heading font-semibold text-[#11233d]">{title}</h4>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children, onDetail }: { title: string; children: React.ReactNode; onDetail?: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#11233d]">{title}</h4>
        {onDetail && (
          <Button type="button" variant="brandOutline" size="xs" onClick={onDetail}>
            <ExternalLink className="size-3" /> Detalle
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      />
    </div>
  );
}

export function FinancialAnalysisForm({
  value,
  montoOfertado,
  notasLibres,
  onNotasChange,
  onChange,
}: {
  value: AnalisisFinancieroJson;
  montoOfertado: number | null;
  notasLibres: string;
  onNotasChange: (v: string) => void;
  onChange: (next: AnalisisFinancieroJson) => void;
}) {
  const [sheet, setSheet] = useState<
    "ida" | "regreso" | "locales" | "alojamiento" | "viaticos" | "materiales" | "otros" | "coffee" | "almuerzo" | null
  >(null);

  function patch(partial: Partial<AnalisisFinancieroJson>) {
    onChange(recalcularAnalisis({ ...value, ...partial }, montoOfertado));
  }

  return (
    <div className="space-y-3">
      <Section title="Horas relatoría">
        <NumInput label="Valor hora bruto" value={value.relatores.valorHoraBruto} onChange={(v) => patch({ relatores: { ...value.relatores, valorHoraBruto: v } })} />
        <NumInput label="N° horas curso" value={value.relatores.horasCurso} onChange={(v) => patch({ relatores: { ...value.relatores, horasCurso: v } })} />
        <NumInput label="N° horas preparación" value={value.relatores.horasPreparacion} onChange={(v) => patch({ relatores: { ...value.relatores, horasPreparacion: v } })} />
        <NumInput label="N° relatores" value={value.relatores.numRelatores} onChange={(v) => patch({ relatores: { ...value.relatores, numRelatores: v } })} />
        <p className="sm:col-span-2 text-sm font-medium">Subtotal: {formatMontoCLP(value.relatores.subtotal)}</p>
      </Section>

      <Section title="Arriendo lugar">
        <NumInput label="Precio diario sin IVA" value={value.arriendo.precioDiarioSinIva} onChange={(v) => patch({ arriendo: { ...value.arriendo, precioDiarioSinIva: v } })} />
        <NumInput label="IVA %" value={value.arriendo.ivaPct} onChange={(v) => patch({ arriendo: { ...value.arriendo, ivaPct: v ?? IVA_DEFAULT } })} />
        <NumInput label="N° días" value={value.arriendo.numDias} onChange={(v) => patch({ arriendo: { ...value.arriendo, numDias: v } })} />
        <p className="text-sm font-medium">Total: {formatMontoCLP(value.arriendo.total)}</p>
      </Section>

      <Section title="Coffee" onDetail={() => setSheet("coffee")}>
        <NumInput
          label="Valor unit. sin IVA"
          value={value.coffee.valorUnitarioSinIva}
          onChange={(v) => patch({ coffee: { ...value.coffee, valorUnitarioSinIva: v } })}
        />
        <NumInput
          label="IVA %"
          value={value.coffee.ivaPct}
          onChange={(v) => patch({ coffee: { ...value.coffee, ivaPct: v ?? IVA_DEFAULT } })}
        />
        <NumInput
          label="Cantidad"
          value={value.coffee.cantidad}
          onChange={(v) => patch({ coffee: { ...value.coffee, cantidad: v } })}
        />
        <p className="text-sm font-medium">Subtotal: {formatMontoCLP(value.coffee.subtotal)}</p>
      </Section>

      <Section title="Almuerzo" onDetail={() => setSheet("almuerzo")}>
        <NumInput label="Valor unit. sin IVA" value={value.almuerzo.valorUnitarioSinIva} onChange={(v) => patch({ almuerzo: { ...value.almuerzo, valorUnitarioSinIva: v } })} />
        <NumInput label="IVA %" value={value.almuerzo.ivaPct} onChange={(v) => patch({ almuerzo: { ...value.almuerzo, ivaPct: v ?? IVA_DEFAULT } })} />
        <NumInput label="Cantidad" value={value.almuerzo.cantidad} onChange={(v) => patch({ almuerzo: { ...value.almuerzo, cantidad: v } })} />
        <p className="text-sm font-medium">Subtotal: {formatMontoCLP(value.almuerzo.subtotal)}</p>
      </Section>

      <Section title="Traslado Ida" onDetail={() => setSheet("ida")}>
        <NumInput label="N° personas" value={value.trasladoIda.numPersonas} onChange={(v) => patch({ trasladoIda: { ...value.trasladoIda, numPersonas: v } })} />
        <p className="text-sm font-medium">Subtotal: {formatMontoCLP(value.trasladoIda.subtotal)}</p>
      </Section>

      <Section title="Traslado Regreso" onDetail={() => setSheet("regreso")}>
        <NumInput label="N° personas" value={value.trasladoRegreso.numPersonas} onChange={(v) => patch({ trasladoRegreso: { ...value.trasladoRegreso, numPersonas: v } })} />
        <p className="text-sm font-medium">Subtotal: {formatMontoCLP(value.trasladoRegreso.subtotal)}</p>
      </Section>

      <Section title="Traslados locales diarios" onDetail={() => setSheet("locales")}>
        <NumInput label="N° días" value={value.trasladosLocales.numDias} onChange={(v) => patch({ trasladosLocales: { ...value.trasladosLocales, numDias: v } })} />
        <NumInput label="N° relatores" value={value.trasladosLocales.numRelatores} onChange={(v) => patch({ trasladosLocales: { ...value.trasladosLocales, numRelatores: v } })} />
        <p className="sm:col-span-2 text-sm font-medium">Subtotal: {formatMontoCLP(value.trasladosLocales.subtotal)}</p>
      </Section>

      <Section title="Alojamiento diario" onDetail={() => setSheet("alojamiento")}>
        <NumInput label="N° días" value={value.alojamiento.numDias} onChange={(v) => patch({ alojamiento: { ...value.alojamiento, numDias: v } })} />
        <NumInput label="N° relatores" value={value.alojamiento.numRelatores} onChange={(v) => patch({ alojamiento: { ...value.alojamiento, numRelatores: v } })} />
        <p className="sm:col-span-2 text-sm font-medium">Subtotal: {formatMontoCLP(value.alojamiento.subtotal)}</p>
      </Section>

      <Section title="Viáticos diarios" onDetail={() => setSheet("viaticos")}>
        <NumInput label="N° días" value={value.viaticos.numDias} onChange={(v) => patch({ viaticos: { ...value.viaticos, numDias: v } })} />
        <NumInput label="N° relatores" value={value.viaticos.numRelatores} onChange={(v) => patch({ viaticos: { ...value.viaticos, numRelatores: v } })} />
        <p className="sm:col-span-2 text-sm font-medium">Subtotal: {formatMontoCLP(value.viaticos.subtotal)}</p>
      </Section>

      <Section title="Materiales" onDetail={() => setSheet("materiales")}>
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Total: {formatMontoCLP(value.materiales.reduce((s, i) => s + (i.subtotal ?? 0), 0))}
        </p>
      </Section>

      <Section title="Otros" onDetail={() => setSheet("otros")}>
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Total: {formatMontoCLP(value.otros.reduce((s, i) => s + (i.subtotal ?? 0), 0))}
        </p>
      </Section>

      <Section title="Pago IVA / PPM">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={value.impuesto.tipo} onValueChange={(v) => patch({ impuesto: { ...value.impuesto, tipo: (v ?? "iva") as "iva" | "ppm" } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="iva">IVA (19%)</SelectItem>
              <SelectItem value="ppm">PPM manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumInput label="%" value={value.impuesto.porcentaje} onChange={(v) => patch({ impuesto: { ...value.impuesto, porcentaje: v } })} />
      </Section>

      <div className="rounded-lg border-2 border-[#d4a017]/40 bg-[#fef9ec] p-3 text-sm">
        <p><strong>Total costos:</strong> {formatMontoCLP(totalCostos(value))}</p>
        <p><strong>Ingreso estimado:</strong> {formatMontoCLP(ingresoNeto(montoOfertado, value))}</p>
      </div>

      <div className="space-y-1">
        <Label>Notas libres del análisis</Label>
        <textarea
          className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm"
          value={notasLibres}
          onChange={(e) => onNotasChange(e.target.value)}
          placeholder="Comentarios adicionales…"
        />
      </div>

      {/* Traslado largo sheets */}
      {(["ida", "regreso"] as const).map((side) => {
        const key = side === "ida" ? "trasladoIda" : "trasladoRegreso";
        const line = value[key];
        return (
          <DetailSheet key={side} title={side === "ida" ? "Detalle Traslado Ida" : "Detalle Traslado Regreso"} open={sheet === side} onClose={() => setSheet(null)}>
            {line.detalles.map((d, i) => (
              <div key={i} className="mb-3 grid gap-2 rounded border p-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Modo</Label>
                  <Select value={d.modo} onValueChange={(v) => {
                    const detalles = [...line.detalles];
                    detalles[i] = { ...d, modo: (v ?? "bus") as typeof d.modo };
                    patch({ [key]: { ...line, detalles } });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODO_TRASLADO_LARGO.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <NumInput label="Monto" value={d.monto} onChange={(v) => {
                  const detalles = [...line.detalles];
                  detalles[i] = { ...d, monto: v };
                  patch({ [key]: { ...line, detalles } });
                }} />
                <Input className="sm:col-span-2" placeholder="Detalle" value={d.detalle ?? ""} onChange={(e) => {
                  const detalles = [...line.detalles];
                  detalles[i] = { ...d, detalle: e.target.value };
                  patch({ [key]: { ...line, detalles } });
                }} />
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => patch({ [key]: { ...line, detalles: [...line.detalles, emptyDetalleTrasladoLargo()] } })}>
              + Agregar tramo
            </Button>
          </DetailSheet>
        );
      })}

      <DetailSheet title="Traslados locales" open={sheet === "locales"} onClose={() => setSheet(null)}>
        {value.trasladosLocales.detalles.map((d, i) => (
          <div key={i} className="mb-3 grid gap-2 rounded border p-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Modo</Label>
              <Select
                value={d.modo}
                onValueChange={(v) => {
                  const detalles = [...value.trasladosLocales.detalles];
                  detalles[i] = { ...d, modo: (v ?? "bus") as typeof d.modo };
                  patch({ trasladosLocales: { ...value.trasladosLocales, detalles } });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Modo" /></SelectTrigger>
                <SelectContent>
                  {MODO_TRASLADO_LOCAL.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {d.modo === "app" && (
              <div className="space-y-1">
                <Label className="text-xs">App (Uber, Cabify, Didi…)</Label>
                <Input
                  value={d.appNombre ?? ""}
                  placeholder="Ej: Uber"
                  onChange={(e) => {
                    const detalles = [...value.trasladosLocales.detalles];
                    detalles[i] = { ...d, appNombre: e.target.value || null };
                    patch({ trasladosLocales: { ...value.trasladosLocales, detalles } });
                  }}
                />
              </div>
            )}
            <NumInput
              label="Monto"
              value={d.monto}
              onChange={(v) => {
                const detalles = [...value.trasladosLocales.detalles];
                detalles[i] = { ...d, monto: v };
                patch({ trasladosLocales: { ...value.trasladosLocales, detalles } });
              }}
            />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => patch({ trasladosLocales: { ...value.trasladosLocales, detalles: [...value.trasladosLocales.detalles, emptyDetalleTrasladoLocal()] } })}>
          + Agregar
        </Button>
      </DetailSheet>

      <DetailSheet title="Detalle Alojamiento" open={sheet === "alojamiento"} onClose={() => setSheet(null)}>
        {value.alojamiento.detalles.map((d, i) => (
          <div key={i} className="mb-3 grid gap-2 rounded border p-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={d.tipo}
                onValueChange={(v) => {
                  const detalles = [...value.alojamiento.detalles];
                  detalles[i] = { ...d, tipo: (v ?? "hotel") as typeof d.tipo };
                  patch({ alojamiento: { ...value.alojamiento, detalles } });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_ALOJAMIENTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <NumInput
              label="Monto"
              value={d.monto}
              onChange={(v) => {
                const detalles = [...value.alojamiento.detalles];
                detalles[i] = { ...d, monto: v };
                patch({ alojamiento: { ...value.alojamiento, detalles } });
              }}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Nombre del hospedaje"
              value={d.nombre ?? ""}
              onChange={(e) => {
                const detalles = [...value.alojamiento.detalles];
                detalles[i] = { ...d, nombre: e.target.value || null };
                patch({ alojamiento: { ...value.alojamiento, detalles } });
              }}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Dirección"
              value={d.direccion ?? ""}
              onChange={(e) => {
                const detalles = [...value.alojamiento.detalles];
                detalles[i] = { ...d, direccion: e.target.value || null };
                patch({ alojamiento: { ...value.alojamiento, detalles } });
              }}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Enlace web"
              value={d.web ?? ""}
              onChange={(e) => {
                const detalles = [...value.alojamiento.detalles];
                detalles[i] = { ...d, web: e.target.value || null };
                patch({ alojamiento: { ...value.alojamiento, detalles } });
              }}
            />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => patch({ alojamiento: { ...value.alojamiento, detalles: [...value.alojamiento.detalles, emptyDetalleAlojamiento()] } })}>
          + Agregar hospedaje
        </Button>
      </DetailSheet>

      <DetailSheet title="Detalle Viáticos" open={sheet === "viaticos"} onClose={() => setSheet(null)}>
        {value.viaticos.detalles.map((d, i) => (
          <div key={i} className="mb-3 grid gap-2 rounded border p-2">
            <Input
              placeholder="Descripción general"
              value={d.descripcion ?? ""}
              onChange={(e) => {
                const detalles = [...value.viaticos.detalles];
                detalles[i] = { ...d, descripcion: e.target.value || null };
                patch({ viaticos: { ...value.viaticos, detalles } });
              }}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Desayuno"
                value={d.desayuno ?? ""}
                onChange={(e) => {
                  const detalles = [...value.viaticos.detalles];
                  detalles[i] = { ...d, desayuno: e.target.value || null };
                  patch({ viaticos: { ...value.viaticos, detalles } });
                }}
              />
              <Input
                placeholder="Almuerzo"
                value={d.almuerzo ?? ""}
                onChange={(e) => {
                  const detalles = [...value.viaticos.detalles];
                  detalles[i] = { ...d, almuerzo: e.target.value || null };
                  patch({ viaticos: { ...value.viaticos, detalles } });
                }}
              />
              <Input
                placeholder="Cena"
                value={d.cena ?? ""}
                onChange={(e) => {
                  const detalles = [...value.viaticos.detalles];
                  detalles[i] = { ...d, cena: e.target.value || null };
                  patch({ viaticos: { ...value.viaticos, detalles } });
                }}
              />
            </div>
            <NumInput
              label="Monto"
              value={d.monto}
              onChange={(v) => {
                const detalles = [...value.viaticos.detalles];
                detalles[i] = { ...d, monto: v };
                patch({ viaticos: { ...value.viaticos, detalles } });
              }}
            />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => patch({ viaticos: { ...value.viaticos, detalles: [...value.viaticos.detalles, emptyDetalleViatico()] } })}>
          + Agregar viático
        </Button>
      </DetailSheet>

      {/* Coffee detail sheet */}
      <DetailSheet title="Detalle Coffee" open={sheet === "coffee"} onClose={() => setSheet(null)}>
        <div className="mb-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Proveedor / catering</Label>
            <Input
              value={value.coffee.detalleProveedor ?? ""}
              placeholder="Nombre proveedor"
              onChange={(e) =>
                patch({ coffee: { ...value.coffee, detalleProveedor: e.target.value || null } })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas generales</Label>
            <textarea
              className="min-h-16 w-full rounded-lg border px-3 py-2 text-sm"
              value={value.coffee.detalleNotas ?? ""}
              placeholder="Menú, restricciones, horarios…"
              onChange={(e) =>
                patch({ coffee: { ...value.coffee, detalleNotas: e.target.value || null } })
              }
            />
          </div>
        </div>
        {(value.coffee.detalles.length ? value.coffee.detalles : [emptyDetalleCoffee("am")]).map((d, i) => (
          <div key={i} className="mb-3 grid gap-2 rounded border p-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Periodo</Label>
              <Select
                value={d.periodo}
                onValueChange={(v) => {
                  const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                  detalles[i] = { ...d, periodo: (v ?? "am") as "am" | "pm" };
                  patch({ coffee: { ...value.coffee, detalles } });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="am">AM</SelectItem>
                  <SelectItem value="pm">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumInput
              label="Cantidad"
              value={d.cantidad}
              onChange={(v) => {
                const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                detalles[i] = { ...d, cantidad: v };
                patch({ coffee: { ...value.coffee, detalles } });
              }}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Descripción"
              value={d.descripcion ?? ""}
              onChange={(e) => {
                const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                detalles[i] = { ...d, descripcion: e.target.value || null };
                patch({ coffee: { ...value.coffee, detalles } });
              }}
            />
            <NumInput
              label={d.incluyeIva ? "Valor unit. con IVA" : "Valor unit. sin IVA"}
              value={d.valorUnitario}
              onChange={(v) => {
                const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                detalles[i] = { ...d, valorUnitario: v };
                patch({ coffee: { ...value.coffee, detalles } });
              }}
            />
            <div className="space-y-1">
              <Label className="text-xs">IVA %</Label>
              <Input
                type="number"
                value={d.ivaPct}
                disabled={d.incluyeIva}
                onChange={(e) => {
                  const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                  detalles[i] = { ...d, ivaPct: e.target.value ? Number(e.target.value) : IVA_DEFAULT };
                  patch({ coffee: { ...value.coffee, detalles } });
                }}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id={`coffee-iva-${i}`}
                checked={d.incluyeIva}
                onChange={(e) => {
                  const detalles = [...(value.coffee.detalles.length ? value.coffee.detalles : [d])];
                  detalles[i] = { ...d, incluyeIva: e.target.checked };
                  patch({ coffee: { ...value.coffee, detalles } });
                }}
              />
              <Label htmlFor={`coffee-iva-${i}`} className="text-xs cursor-pointer">
                Valor incluye IVA
              </Label>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch({
              coffee: {
                ...value.coffee,
                detalles: [...value.coffee.detalles, emptyDetalleCoffee("am")],
              },
            })
          }
        >
          + Agregar coffee
        </Button>
      </DetailSheet>

      <DetailSheet title="Detalle Almuerzo" open={sheet === "almuerzo"} onClose={() => setSheet(null)}>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Proveedor / catering</Label>
            <Input
              value={value.almuerzo.detalleProveedor ?? ""}
              placeholder="Nombre proveedor"
              onChange={(e) => patch({ almuerzo: { ...value.almuerzo, detalleProveedor: e.target.value || null } })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Detalle del servicio</Label>
            <textarea
              className="min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
              value={value.almuerzo.detalleNotas ?? ""}
              placeholder="Menú, restricciones, horarios…"
              onChange={(e) => patch({ almuerzo: { ...value.almuerzo, detalleNotas: e.target.value || null } })}
            />
          </div>
        </div>
      </DetailSheet>

      {/* Materiales / Otros tables */}
      {(["materiales", "otros"] as const).map((key) => (
        <DetailSheet key={key} title={key === "materiales" ? "Detalle Materiales" : "Detalle Otros"} open={sheet === key} onClose={() => setSheet(null)}>
          {value[key].map((item, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-5">
              <Input className="sm:col-span-2" placeholder="Ítem" value={item.descripcion} onChange={(e) => {
                const rows = [...value[key]];
                rows[i] = { ...item, descripcion: e.target.value };
                patch({ [key]: rows });
              }} />
              <NumInput label="Precio unit." value={item.precioUnitario} onChange={(v) => {
                const rows = [...value[key]];
                rows[i] = { ...item, precioUnitario: v };
                patch({ [key]: rows });
              }} />
              <NumInput label="Cant." value={item.cantidad} onChange={(v) => {
                const rows = [...value[key]];
                rows[i] = { ...item, cantidad: v };
                patch({ [key]: rows });
              }} />
              <p className="flex items-end pb-2 text-xs font-medium">
                {formatMontoCLP(item.subtotal)}
              </p>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => patch({ [key]: [...value[key], emptyItemTabla()] })}>
            + Fila
          </Button>
        </DetailSheet>
      ))}
    </div>
  );
}
