"use client";

import type { MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, X } from "lucide-react";
import { MpEstadoBadge } from "@/lib/dashboard/mp-estado-badge";
import { formatFechaCL, formatHora, tipoLabel } from "@/lib/dashboard/format";
import { formatMontoCLP } from "@/lib/montos";
import type { KanbanCardRow } from "@/lib/kanban/types";
import { Button } from "@/components/ui/button";

interface KanbanCardItemProps {
  card: KanbanCardRow;
  onOpen: () => void;
  onArchive?: (card: KanbanCardRow) => void;
  onRemove?: (card: KanbanCardRow) => void;
  archiving?: boolean;
  removing?: boolean;
}

export function KanbanCardItem({ card, onOpen, onArchive, onRemove, archiving, removing }: KanbanCardItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KanbanCardPreview
        card={card}
        onOpen={onOpen}
        onArchive={onArchive}
        onRemove={onRemove}
        archiving={archiving}
        removing={removing}
        dragHandleRef={setActivatorNodeRef}
        dragHandleProps={listeners}
      />
    </div>
  );
}

export function KanbanCardPreview({
  card,
  onOpen,
  onArchive,
  onRemove,
  archiving = false,
  removing = false,
  dragging = false,
  dragHandleRef,
  dragHandleProps,
}: {
  card: KanbanCardRow;
  onOpen?: () => void;
  onArchive?: (card: KanbanCardRow) => void;
  onRemove?: (card: KanbanCardRow) => void;
  archiving?: boolean;
  removing?: boolean;
  dragging?: boolean;
  dragHandleRef?: (element: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const p = card.process;
  const actionDisabled = archiving || removing;

  async function handleArchive(e: MouseEvent) {
    e.stopPropagation();
    if (!onArchive) return;
    if (!confirm("¿Archivar esta tarjeta? Saldrá del Kanban y quedará en Archivo CRM.")) return;
    onArchive(card);
  }

  async function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    if (!onRemove) return;
    if (!confirm("¿Quitar del Kanban? El proceso volverá al Dashboard sin archivar.")) return;
    onRemove(card);
  }

  return (
    <div
      className={`w-full rounded-lg border bg-card p-3 text-left shadow-sm transition hover:border-[#d4a017]/60 ${
        dragging ? "rotate-2 shadow-lg" : ""
      } ${p.adjudicado_a_mi ? "border-emerald-400 bg-emerald-50/50" : ""}`}
    >
      <div className="mb-1 flex items-start gap-1">
        <button
          type="button"
          ref={dragHandleRef}
          className="mt-0.5 cursor-grab text-muted-foreground hover:text-[#11233d] active:cursor-grabbing"
          aria-label="Arrastrar tarjeta"
          {...dragHandleProps}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <button type="button" onClick={onOpen} className="font-mono text-[10px] text-muted-foreground hover:underline">
              {p.codigo_externo}
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  disabled={actionDisabled}
                  aria-label="Quitar del Kanban"
                  onClick={handleRemove}
                >
                  <X className="size-3.5" />
                </Button>
              )}
              {onArchive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  disabled={actionDisabled}
                  aria-label="Archivar tarjeta"
                  onClick={handleArchive}
                >
                  <Archive className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
          <button type="button" onClick={onOpen} className="w-full text-left">
            <p className="line-clamp-2 text-sm font-medium leading-snug" title={p.nombre}>
              {p.nombre}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{tipoLabel(p.tipo)}</p>

            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <span>Máx: {formatMontoCLP(p.monto_estimado)}</span>
              <span>Cierre: {formatFechaCL(p.fecha_cierre)}</span>
              <span className="col-span-2">Hora: {formatHora(p.hora_cierre)}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <MpEstadoBadge
                estado={p.estado}
                adjudicadoAMi={p.adjudicado_a_mi}
                adjudicadoRut={p.adjudicado_rut}
              />
              {card.estado_interno && (
                <span className="rounded-full border border-[#d4a017]/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {card.estado_interno}
                </span>
              )}
              {card.responsable && (
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {card.responsable}
                </span>
              )}
            </div>

            {card.monto_ofertado != null && (
              <p className="mt-2 text-xs font-semibold text-[#11233d]">
                Oferta: {formatMontoCLP(card.monto_ofertado)}
              </p>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
