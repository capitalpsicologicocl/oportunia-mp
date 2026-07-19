"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { KanbanBoardData, KanbanCardRow } from "@/lib/kanban/types";
import {
  KANBAN_COLUMNS,
  KANBAN_COLUMN_COLORS,
  KANBAN_COLUMN_LABELS,
} from "@/lib/kanban/columns";
import type { KanbanColumna } from "@/types/database";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { KanbanCardPreview } from "@/components/kanban/kanban-card";
import { CardDetailPanel } from "@/components/kanban/card-detail-panel";
import { formatMontoCLP } from "@/lib/montos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function cierreTimestamp(card: KanbanCardRow): number {
  const p = card.process;
  if (!p.fecha_cierre) return Number.MAX_SAFE_INTEGER;
  const datePart = p.fecha_cierre.slice(0, 10);
  const timePart = p.hora_cierre?.trim() || "23:59";
  const parsed = new Date(`${datePart}T${timePart.length <= 5 ? timePart : "23:59"}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(p.fecha_cierre).getTime() : parsed.getTime();
}

function groupByColumn(cards: KanbanCardRow[]): Record<KanbanColumna, KanbanCardRow[]> {
  const grouped = {
    preevaluacion: [] as KanbanCardRow[],
    preparacion_pt: [] as KanbanCardRow[],
    postulada: [] as KanbanCardRow[],
    ejecucion: [] as KanbanCardRow[],
    cierre: [] as KanbanCardRow[],
    pagada: [] as KanbanCardRow[],
  };
  for (const card of cards) {
    if (grouped[card.columna]) grouped[card.columna].push(card);
  }
  for (const col of KANBAN_COLUMNS) {
    grouped[col].sort((a, b) => cierreTimestamp(a) - cierreTimestamp(b) || a.orden - b.orden);
  }
  return grouped;
}

function flattenColumns(grouped: Record<KanbanColumna, KanbanCardRow[]>): KanbanCardRow[] {
  return KANBAN_COLUMNS.flatMap((col) => grouped[col]);
}

interface KanbanBoardProps {
  initialData: KanbanBoardData;
  initialQ?: string;
  initialCardId?: string;
}

export function KanbanBoard({ initialData, initialQ = "", initialCardId }: KanbanBoardProps) {
  const [cards, setCards] = useState(initialData.cards);
  const [grouped, setGrouped] = useState(() => groupByColumn(initialData.cards));
  const [yearStats, setYearStats] = useState(initialData.yearStats);
  const [activeCard, setActiveCard] = useState<KanbanCardRow | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCardRow | null>(null);
  const [q, setQ] = useState(initialQ);
  const [addCodigo, setAddCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [archivingCardId, setArchivingCardId] = useState<string | null>(null);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!initialCardId) return;
    const card = cards.find((c) => c.id === initialCardId);
    if (card) setSelectedCard(card);
  }, [initialCardId, cards]);

  const stats = useMemo(() => {
    const byColumn = Object.fromEntries(KANBAN_COLUMNS.map((col) => [col, grouped[col].length])) as Record<
      KanbanColumna,
      number
    >;
    return { total: cards.length, byColumn };
  }, [cards.length, grouped]);

  async function reloadBoard(nextQ = q) {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (nextQ.trim()) params.set("q", nextQ.trim());
      const res = await fetch(`/api/kanban?${params.toString()}`);
      const data = (await res.json()) as KanbanBoardData & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error al cargar");
      setCards(data.cards);
      setGrouped(groupByColumn(data.cards));
      setYearStats(data.yearStats);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceCol = KANBAN_COLUMNS.find((col) =>
      grouped[col].some((card) => card.id === activeId)
    );
    if (!sourceCol) return;

    let destCol: KanbanColumna | undefined;
    let destIndex = 0;

    if (KANBAN_COLUMNS.includes(overId as KanbanColumna)) {
      destCol = overId as KanbanColumna;
      destIndex = grouped[destCol].length;
    } else {
      destCol = KANBAN_COLUMNS.find((col) => grouped[col].some((card) => card.id === overId));
      if (!destCol) return;
      destIndex = grouped[destCol].findIndex((card) => card.id === overId);
      if (destIndex < 0) destIndex = grouped[destCol].length;
    }

    const sourceItems = [...grouped[sourceCol]];
    const activeIndex = sourceItems.findIndex((card) => card.id === activeId);
    if (activeIndex < 0) return;

    const [moved] = sourceItems.splice(activeIndex, 1);
    const destItems = sourceCol === destCol ? sourceItems : [...grouped[destCol]];
    destItems.splice(destIndex, 0, { ...moved, columna: destCol });

    const nextGrouped = {
      ...grouped,
      [sourceCol]: sourceCol === destCol ? destItems : sourceItems,
      [destCol]: destItems,
    };

    const reindexedDest = destItems.map((card, index) => ({ ...card, orden: index + 1 }));
    nextGrouped[destCol] = reindexedDest;

    setGrouped(nextGrouped);
    setCards(flattenColumns(nextGrouped));

    try {
      await fetch(`/api/kanban/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columna: destCol, orden: destIndex + 1 }),
      });
    } catch {
      setMessage("No se pudo guardar el movimiento. Recarga la página.");
    }
  }

  async function handleAddProcess() {
    if (!addCodigo.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo_externo: addCodigo.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo agregar");
      setAddCodigo("");
      setMessage(`Proceso ${addCodigo.trim()} agregado al CRM.`);
      await reloadBoard(q);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setLoading(false);
    }
  }

  function handleCardUpdated(updated: KanbanCardRow) {
    const nextCards = cards.map((card) => (card.id === updated.id ? updated : card));
    setCards(nextCards);
    setGrouped(groupByColumn(nextCards));
    setSelectedCard(updated);
  }

  async function handleArchiveCard(card: KanbanCardRow) {
    setArchivingCardId(card.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descartado: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo archivar");

      const next = cards.filter((c) => c.id !== card.id);
      setCards(next);
      setGrouped(groupByColumn(next));
      if (selectedCard?.id === card.id) setSelectedCard(null);
      setMessage(`${card.process.codigo_externo} archivada.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al archivar");
    } finally {
      setArchivingCardId(null);
    }
  }

  async function handleRemoveCard(card: KanbanCardRow) {
    setRemovingCardId(card.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ en_pipeline: false }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo quitar del Kanban");

      const next = cards.filter((c) => c.id !== card.id);
      setCards(next);
      setGrouped(groupByColumn(next));
      if (selectedCard?.id === card.id) setSelectedCard(null);
      setMessage(`${card.process.codigo_externo} quitada del Kanban.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al quitar del Kanban");
    } finally {
      setRemovingCardId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: `Adjudicadas ${yearStats.year}`, value: String(yearStats.adjudicadas) },
          { label: "Monto postulado", value: formatMontoCLP(yearStats.montoPostulado) },
          { label: "Monto adjudicado", value: formatMontoCLP(yearStats.montoAdjudicado) },
          { label: "Ingreso estimado", value: formatMontoCLP(yearStats.ingresoEstimado) },
        ].map((s) => (
          <div key={s.label} className="brand-stat">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold text-[#11233d]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 brand-card p-4">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label htmlFor="kanban-q">Buscar</Label>
          <Input
            id="kanban-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, nombre, responsable…"
          />
        </div>
        <Button type="button" disabled={loading} onClick={() => reloadBoard()}>
          {loading ? "Cargando…" : "Buscar"}
        </Button>
        <div className="flex min-w-[240px] flex-1 items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="kanban-add">Agregar proceso</Label>
            <Input
              id="kanban-add"
              value={addCodigo}
              onChange={(e) => setAddCodigo(e.target.value)}
              placeholder="618923-65-COT26"
            />
          </div>
          <Button type="button" variant="secondary" disabled={loading} onClick={handleAddProcess}>
            Agregar
          </Button>
        </div>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{stats.total} tarjetas</span>
        {KANBAN_COLUMNS.map((col) => (
          <span key={col}>
            · {KANBAN_COLUMN_LABELS[col]}: {stats.byColumn[col]}
          </span>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((columnId) => (
            <KanbanColumn
              key={columnId}
              columnId={columnId}
              title={KANBAN_COLUMN_LABELS[columnId]}
              colorClass={KANBAN_COLUMN_COLORS[columnId]}
              cards={grouped[columnId]}
              onOpenCard={setSelectedCard}
              onArchiveCard={handleArchiveCard}
              onRemoveCard={handleRemoveCard}
              archivingCardId={archivingCardId}
              removingCardId={removingCardId}
            />
          ))}
        </div>
        <DragOverlay>{activeCard ? <KanbanCardPreview card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>

      {selectedCard && (
        <CardDetailPanel
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdated={handleCardUpdated}
          onDiscarded={() => {
            const next = cards.filter((c) => c.id !== selectedCard.id);
            setCards(next);
            setGrouped(groupByColumn(next));
          }}
        />
      )}
    </div>
  );
}
