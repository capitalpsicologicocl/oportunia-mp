"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { KanbanCardRow } from "@/lib/kanban/types";
import type { KanbanColumna } from "@/types/database";
import { KanbanCardItem } from "@/components/kanban/kanban-card";

interface KanbanColumnProps {
  columnId: KanbanColumna;
  title: string;
  colorClass: string;
  cards: KanbanCardRow[];
  onOpenCard: (card: KanbanCardRow) => void;
  onArchiveCard?: (card: KanbanCardRow) => void;
  onRemoveCard?: (card: KanbanCardRow) => void;
  archivingCardId?: string | null;
  removingCardId?: string | null;
}

export function KanbanColumn({
  columnId,
  title,
  colorClass,
  cards,
  onOpenCard,
  onArchiveCard,
  onRemoveCard,
  archivingCardId,
  removingCardId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/30 ${colorClass} ${
        isOver ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {cards.length}
        </span>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-3">
          {cards.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">Sin tarjetas</p>
          ) : (
            cards.map((card) => (
              <KanbanCardItem
                key={card.id}
                card={card}
                onOpen={() => onOpenCard(card)}
                onArchive={onArchiveCard}
                onRemove={onRemoveCard}
                archiving={archivingCardId === card.id}
                removing={removingCardId === card.id}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
