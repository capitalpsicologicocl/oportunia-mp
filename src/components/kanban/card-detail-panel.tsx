"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { FinancialAnalysisForm } from "@/components/kanban/financial-analysis-form";
import { formatFechaCL, formatHora, tipoLabel } from "@/lib/dashboard/format";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import {
  ESTADOS_INTERNOS,
  emptyCamposDescriptivos,
  recalcularAnalisis,
  type CamposDescriptivosJson,
} from "@/lib/kanban/financial-analysis";
import type { KanbanCardRow } from "@/lib/kanban/types";
import { formatMontoCLP } from "@/lib/montos";

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
  const [responsable, setResponsable] = useState(card.responsable ?? "");
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

  const [contactoContraparte, setContactoContraparte] = useState(card.contacto.contacto_contraparte ?? "");
  const [contactoResponsable, setContactoResponsable] = useState(card.contacto.contacto_responsable ?? "");
  const [contactoEmail, setContactoEmail] = useState(card.contacto.contacto_email ?? "");
  const [contactoTelefono, setContactoTelefono] = useState(card.contacto.contacto_telefono ?? "");
  const [contactoDireccion, setContactoDireccion] = useState(card.contacto.contacto_direccion ?? "");
  const [direccionEjecucion, setDireccionEjecucion] = useState(card.contacto.direccion_ejecucion ?? "");

  useEffect(() => {
    setEstadoInterno(card.estado_interno ?? "");
    setFinanciero(card.analisis_financiero_json);
    setDescriptivos(card.campos_descriptivos);
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
          responsable: responsable.trim() || null,
          fecha_postulacion: fechaPostulacion || null,
          fechas_ejecucion: fechasEjecucion.trim() || null,
          link_propuesta_tecnica: linkPropuesta.trim() || null,
          link_carpeta_interna: linkCarpeta.trim() || null,
          monto_ofertado: montoOfertadoNum,
          analisis_financiero: analisisFinanciero.trim() || null,
          analisis_financiero_json: recalcularAnalisis(financiero, montoOfertadoNum),
          campos_descriptivos: descriptivos,
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#d4a017]/30 bg-[#11233d] px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-[#d4a017]">{card.process.codigo_externo}</p>
              <h2 className="font-heading text-lg font-semibold leading-snug">{card.process.nombre}</h2>
              <p className="text-sm text-white/70">
                {tipoLabel(card.process.tipo)} · {KANBAN_COLUMN_LABELS[card.columna]}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-4 py-4">
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
              <div className="space-y-1">
                <Label>Responsable interno</Label>
                <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              </div>
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
        </div>

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
