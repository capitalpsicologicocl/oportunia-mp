"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardBacklogPanel } from "@/components/kanban/card-backlog-panel";
import { FinancialAnalysisForm } from "@/components/kanban/financial-analysis-form";
import { TeamMemberSelect } from "@/components/kanban/team-member-select";
import { formatFechaCL, formatHora, tipoLabel } from "@/lib/dashboard/format";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import {
  ESTADOS_INTERNOS,
  emptyCamposDescriptivos,
  recalcularAnalisis,
  type CamposDescriptivosJson,
} from "@/lib/kanban/financial-analysis";
import type { KanbanCardRow } from "@/lib/kanban/types";
import {
  formatUbicacionCardSummary,
  isTodoChile,
  type UbicacionChile,
} from "@/lib/kanban/ubicaciones";
import { formatMontoCLP } from "@/lib/montos";
import { Trash2 } from "lucide-react";

interface CardDetailPanelProps {
  card: KanbanCardRow;
  onClose: () => void;
  onUpdated: (card: KanbanCardRow) => void;
  onDiscarded?: () => void;
}

export function CardDetailPanel({ card, onClose, onUpdated, onDiscarded }: CardDetailPanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estadoInterno, setEstadoInterno] = useState(card.estado_interno ?? "");
  const [responsableUserId, setResponsableUserId] = useState<string | null>(card.responsable_user_id ?? null);
  const [responsableDisplay, setResponsableDisplay] = useState(card.responsable ?? "");
  const [fechaPostulacion, setFechaPostulacion] = useState(card.fecha_postulacion ?? "");
  const [fechasEjecucion, setFechasEjecucion] = useState(card.fechas_ejecucion ?? "");
  const [linkPropuesta, setLinkPropuesta] = useState(card.link_propuesta_tecnica ?? "");
  const [linkCarpeta, setLinkCarpeta] = useState(card.link_carpeta_interna ?? "");
  const [montoOfertado, setMontoOfertado] = useState(
    card.monto_ofertado != null ? String(card.monto_ofertado) : ""
  );
  const [analisisFinanciero, setAnalisisFinanciero] = useState(card.analisis_financiero ?? "");
  const [financiero, setFinanciero] = useState(card.analisis_financiero_json);
  const [descriptivos, setDescriptivos] = useState<CamposDescriptivosJson>(card.campos_descriptivos);
  const [ubicaciones, setUbicaciones] = useState<UbicacionChile[]>(card.ubicaciones);
  const [todoChile, setTodoChile] = useState(() => isTodoChile(card.ubicaciones));
  const [activeTab, setActiveTab] = useState("detalle");

  const [contactoContraparte, setContactoContraparte] = useState(card.contacto.contacto_contraparte ?? "");
  const [contactoResponsable, setContactoResponsable] = useState(card.contacto.contacto_responsable ?? "");
  const [contactoEmail, setContactoEmail] = useState(card.contacto.contacto_email ?? "");
  const [contactoTelefono, setContactoTelefono] = useState(card.contacto.contacto_telefono ?? "");
  const [contactoDireccion, setContactoDireccion] = useState(card.contacto.contacto_direccion ?? "");
  const [direccionEjecucion, setDireccionEjecucion] = useState(card.contacto.direccion_ejecucion ?? "");

  useEffect(() => {
    setEstadoInterno(card.estado_interno ?? "");
    setResponsableUserId(card.responsable_user_id ?? null);
    setResponsableDisplay(card.responsable ?? "");
    setFinanciero(card.analisis_financiero_json);
    setDescriptivos(card.campos_descriptivos);
    setUbicaciones(card.ubicaciones);
    setTodoChile(isTodoChile(card.ubicaciones));
  }, [card]);

  const montoOfertadoNum = montoOfertado ? Number(montoOfertado.replace(/\D/g, "")) : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_interno: estadoInterno.trim() || null,
          responsable_user_id: responsableUserId,
          responsable: responsableUserId ? undefined : responsableDisplay.trim() || null,
          fecha_postulacion: fechaPostulacion || null,
          fechas_ejecucion: fechasEjecucion.trim() || null,
          link_propuesta_tecnica: linkPropuesta.trim() || null,
          link_carpeta_interna: linkCarpeta.trim() || null,
          monto_ofertado: montoOfertadoNum,
          analisis_financiero: analisisFinanciero.trim() || null,
          analisis_financiero_json: recalcularAnalisis(financiero, montoOfertadoNum),
          campos_descriptivos: descriptivos,
          ubicaciones_json: ubicaciones,
          otec: {
            modalidad: descriptivos.modalidad,
            num_participantes: descriptivos.numParticipantes,
            duracion_horas: descriptivos.duracionHoras,
            codigo_sence: null,
          },
          contacto: {
            contacto_contraparte: contactoContraparte.trim() || null,
            contacto_responsable: contactoResponsable.trim() || null,
            contacto_email: contactoEmail.trim() || null,
            contacto_telefono: contactoTelefono.trim() || null,
            contacto_direccion: contactoDireccion.trim() || null,
            direccion_ejecucion: direccionEjecucion.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; card?: KanbanCardRow; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo guardar");
      if (data.card) onUpdated(data.card);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    if (!confirm("¿Descartar del Kanban? Quedará en Archivo CRM.")) return;
    setSaving(true);
    try {
      await fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descartado: true }),
      });
      onDiscarded?.();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function handleTodoChile(checked: boolean) {
    setTodoChile(checked);
    if (checked) {
      setUbicaciones([{ ciudad_comuna: "Todo Chile", region: "Nacional" }]);
    } else {
      setUbicaciones([]);
    }
  }

  function addUbicacion() {
    if (todoChile) return;
    setUbicaciones((prev) => [...prev, { ciudad_comuna: "", region: "" }]);
  }

  function updateUbicacion(index: number, patch: Partial<UbicacionChile>) {
    setUbicaciones((prev) =>
      prev.map((u, i) => (i === index ? { ...u, ...patch } : u))
    );
  }

  function removeUbicacion(index: number) {
    setUbicaciones((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#d4a017]/30 bg-[#11233d] px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-[#d4a017]">{card.process.codigo_externo}</p>
              <h2 className="font-heading text-lg font-semibold leading-snug">{card.process.nombre}</h2>
              {(card.process.organismo_nombre || card.ubicaciones.length > 0 || card.process.lugar_ejecucion) && (
                <p className="mt-1 text-sm text-white/85">
                  {[
                    card.process.organismo_nombre,
                    formatUbicacionCardSummary(card.ubicaciones) || card.process.lugar_ejecucion,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-1 text-sm text-white/70">
                {tipoLabel(card.process.tipo)} · {KANBAN_COLUMN_LABELS[card.columna]}
                {card.estado_interno ? ` · ${card.estado_interno}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button type="button" variant="brand" size="sm" onClick={() => setActiveTab("backlog")}>
                Backlog
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
          <div className="border-b px-4 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="detalle" className="flex-1">Detalle</TabsTrigger>
              <TabsTrigger value="backlog" className="flex-1">Backlog</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="detalle" className="space-y-6 px-4 py-4">
          <section className="brand-card space-y-2 p-3 text-sm">
            <p><span className="text-muted-foreground">Monto máximo MP:</span> <strong>{formatMontoCLP(card.process.monto_estimado)}</strong></p>
            <p>
              Cierre: {formatFechaCL(card.process.fecha_cierre)} · Hora: {formatHora(card.process.hora_cierre)}
            </p>
            {card.process.url_publica && (
              <a href={card.process.url_publica} target="_blank" rel="noreferrer" className="text-[#d4a017] hover:underline">
                Ver en Mercado Público →
              </a>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-heading font-semibold text-[#11233d]">Lugar de ejecución</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="todo-chile"
                checked={todoChile}
                onCheckedChange={(checked) => handleTodoChile(checked === true)}
              />
              <Label htmlFor="todo-chile" className="cursor-pointer text-sm">
                Todo Chile
              </Label>
            </div>
            {!todoChile && (
              <div className="space-y-2">
                {ubicaciones.map((u, i) => (
                  <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-xs">Ciudad / comuna</Label>
                      <Input
                        value={u.ciudad_comuna}
                        onChange={(e) => updateUbicacion(i, { ciudad_comuna: e.target.value })}
                        placeholder="Ej: Santiago"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Región</Label>
                      <Input
                        value={u.region}
                        onChange={(e) => updateUbicacion(i, { region: e.target.value })}
                        placeholder="Ej: RM"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="self-end text-muted-foreground hover:text-destructive"
                      onClick={() => removeUbicacion(i)}
                      aria-label="Eliminar ubicación"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={addUbicacion}>
                  + Agregar
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-heading font-semibold text-[#11233d]">Datos de Gestión</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Estado interno</Label>
                <Select value={estadoInterno || "none"} onValueChange={(v) => setEstadoInterno(v === "none" ? "" : v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {ESTADOS_INTERNOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <TeamMemberSelect
                value={responsableUserId}
                displayName={responsableDisplay}
                onChange={(userId, nombre) => {
                  setResponsableUserId(userId);
                  if (userId && nombre) {
                    setResponsableDisplay(`@${nombre}`);
                  } else if (!userId && nombre) {
                    setResponsableDisplay(nombre);
                  } else {
                    setResponsableDisplay("");
                  }
                }}
              />
              <div className="space-y-1">
                <Label>Fecha postulación</Label>
                <Input type="date" value={fechaPostulacion} onChange={(e) => setFechaPostulacion(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Monto ofertado (CLP)</Label>
                <Input value={montoOfertado} onChange={(e) => setMontoOfertado(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Fechas de ejecución</Label>
                <Input value={fechasEjecucion} onChange={(e) => setFechasEjecucion(e.target.value)} placeholder="Ej: 15-20 agosto 2026" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Enlace Propuesta Técnica</Label>
                <Input value={linkPropuesta} onChange={(e) => setLinkPropuesta(e.target.value)} placeholder="https://drive.google.com/..." />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Enlace Carpeta Interna del Curso</Label>
                <Input value={linkCarpeta} onChange={(e) => setLinkCarpeta(e.target.value)} placeholder="Google Drive / OneDrive" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-heading font-semibold text-[#11233d]">Contraparte técnica</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Contraparte</Label><Input value={contactoContraparte} onChange={(e) => setContactoContraparte(e.target.value)} /></div>
              <div className="space-y-1"><Label>Responsable</Label><Input value={contactoResponsable} onChange={(e) => setContactoResponsable(e.target.value)} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={contactoEmail} onChange={(e) => setContactoEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Teléfono</Label><Input value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} /></div>
              <div className="space-y-1"><Label>Dirección</Label><Input value={contactoDireccion} onChange={(e) => setContactoDireccion(e.target.value)} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Lugar / dirección ejecución</Label><Input value={direccionEjecucion} onChange={(e) => setDireccionEjecucion(e.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-heading font-semibold text-[#11233d]">Campos Descriptivos</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>N° relatores</Label>
                <Input type="number" value={descriptivos.numRelatores ?? ""} onChange={(e) => setDescriptivos({ ...descriptivos, numRelatores: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1">
                <Label>Nº de versiones o grupos</Label>
                <Input type="number" value={descriptivos.numVersionesGrupos ?? ""} onChange={(e) => setDescriptivos({ ...descriptivos, numVersionesGrupos: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1">
                <Label>Modalidad</Label>
                <Select value={descriptivos.modalidad ?? "none"} onValueChange={(v) => setDescriptivos({ ...descriptivos, modalidad: v === "none" ? null : (v as CamposDescriptivosJson["modalidad"]) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="elearning">E-learning</SelectItem>
                    <SelectItem value="mixta">Mixta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>N° participantes</Label>
                <Input type="number" value={descriptivos.numParticipantes ?? ""} onChange={(e) => setDescriptivos({ ...descriptivos, numParticipantes: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1">
                <Label>Duración (horas)</Label>
                <Input type="number" value={descriptivos.duracionHoras ?? ""} onChange={(e) => setDescriptivos({ ...descriptivos, duracionHoras: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Relatores</Label>
              {descriptivos.relatores.map((rel, i) => (
                <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-2">
                  <Input placeholder="Nombre relator" value={rel.nombre} onChange={(e) => {
                    const relatores = [...descriptivos.relatores];
                    relatores[i] = { ...rel, nombre: e.target.value };
                    setDescriptivos({ ...descriptivos, relatores });
                  }} />
                  <Input placeholder="Especialidad" value={rel.especialidad ?? ""} onChange={(e) => {
                    const relatores = [...descriptivos.relatores];
                    relatores[i] = { ...rel, especialidad: e.target.value };
                    setDescriptivos({ ...descriptivos, relatores });
                  }} />
                  <Input placeholder="Email" value={rel.email ?? ""} onChange={(e) => {
                    const relatores = [...descriptivos.relatores];
                    relatores[i] = { ...rel, email: e.target.value };
                    setDescriptivos({ ...descriptivos, relatores });
                  }} />
                  <Input placeholder="Teléfono" value={rel.telefono ?? ""} onChange={(e) => {
                    const relatores = [...descriptivos.relatores];
                    relatores[i] = { ...rel, telefono: e.target.value };
                    setDescriptivos({ ...descriptivos, relatores });
                  }} />
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setDescriptivos({ ...descriptivos, relatores: [...descriptivos.relatores, emptyCamposDescriptivos().relatores[0]] })}>
                + Agregar relator
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-heading font-semibold text-[#11233d]">Análisis financiero estructurado</h3>
            <FinancialAnalysisForm
              value={financiero}
              montoOfertado={montoOfertadoNum}
              notasLibres={analisisFinanciero}
              onNotasChange={setAnalisisFinanciero}
              onChange={setFinanciero}
            />
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
          </TabsContent>

          <TabsContent value="backlog" className="px-4 py-4">
            <CardBacklogPanel card={card} onUpdated={onUpdated} />
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background px-4 py-3">
          {!card.process.adjudicado_a_mi && (
            <Button type="button" variant="outline" disabled={saving} onClick={handleDiscard}>
              Descartar del Kanban
            </Button>
          )}
          <Button type="button" variant="brand" disabled={saving} onClick={handleSave}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
