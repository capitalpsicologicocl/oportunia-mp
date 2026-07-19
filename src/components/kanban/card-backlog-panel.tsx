"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TeamMemberSelect } from "@/components/kanban/team-member-select";
import { formatFechaCL } from "@/lib/dashboard/format";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import {
  emptyBacklogItem,
  backlogFromTemplate,
  seedBacklogIfEmpty,
  type BacklogItem,
} from "@/lib/kanban/backlog";
import type { KanbanCardRow } from "@/lib/kanban/types";
import { cn } from "@/lib/utils";

interface CardBacklogPanelProps {
  card: KanbanCardRow;
  onUpdated?: (card: KanbanCardRow) => void;
}

export function CardBacklogPanel({ card, onUpdated }: CardBacklogPanelProps) {
  const [items, setItems] = useState<BacklogItem[]>(() => seedBacklogIfEmpty(card.backlog));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    const seeded = seedBacklogIfEmpty(card.backlog);
    setItems(seeded);
    seededRef.current = false;
  }, [card.id, card.backlog]);

  const saveBacklog = useCallback(
    async (nextItems: BacklogItem[]) => {
      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/kanban/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backlog_json: nextItems }),
        });
        const data = (await res.json()) as { ok?: boolean; card?: KanbanCardRow; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo guardar backlog");
        if (data.card) onUpdated?.(data.card);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("idle");
      }
    },
    [card.id, onUpdated]
  );

  const scheduleSave = useCallback(
    (nextItems: BacklogItem[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSaveStatus("idle");
      saveTimeoutRef.current = setTimeout(() => {
        void saveBacklog(nextItems);
      }, 600);
    },
    [saveBacklog]
  );

  useEffect(() => {
    if (!seededRef.current && card.backlog.length === 0 && items.length > 0) {
      seededRef.current = true;
      scheduleSave(items);
    }
  }, [card.backlog.length, items, scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  function updateItems(updater: (prev: BacklogItem[]) => BacklogItem[]) {
    setItems((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  }

  function toggleDone(id: string, done: boolean) {
    updateItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              done,
              done_at: done ? new Date().toISOString() : null,
            }
          : item
      )
    );
  }

  function updateItem(id: string, patch: Partial<BacklogItem>) {
    updateItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addCustomTask() {
    updateItems((prev) => [...prev, emptyBacklogItem("")]);
  }

  function loadFullTemplate() {
    if (
      !confirm(
        "¿Cargar plantilla completa? Se reemplazarán todas las tareas actuales por las 29 predefinidas."
      )
    ) {
      return;
    }
    const template = backlogFromTemplate();
    setItems(template);
    scheduleSave(template);
  }

  function removeItem(id: string) {
    updateItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleDragEnd(event: DragEndEvent, section: "active" | "done") {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    updateItems((prev) => {
      const activeItems = prev.filter((i) => !i.done);
      const doneItems = prev.filter((i) => i.done);
      const sectionItems = section === "active" ? activeItems : doneItems;
      const oldIndex = sectionItems.findIndex((i) => i.id === active.id);
      const newIndex = sectionItems.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const reordered = arrayMove(sectionItems, oldIndex, newIndex);
      return section === "active" ? [...reordered, ...doneItems] : [...activeItems, ...reordered];
    });
  }

  const activeItems = items.filter((item) => !item.done);
  const doneItems = items.filter((item) => item.done);

  return (
    <div className="space-y-4">
      <div className="brand-card space-y-1 p-3 text-sm">
        <p className="font-mono text-xs text-[#d4a017]">{card.process.codigo_externo}</p>
        <p className="font-heading font-semibold text-[#11233d]">{card.process.nombre}</p>
        <p className="text-muted-foreground">
          Cierre: {formatFechaCL(card.process.fecha_cierre)} · {KANBAN_COLUMN_LABELS[card.columna]}
          {card.estado_interno ? ` · ${card.estado_interno}` : ""}
        </p>
        {saveStatus !== "idle" && (
          <p className="text-xs text-muted-foreground">
            {saveStatus === "saving" ? "Guardando…" : "Guardado"}
          </p>
        )}
      </div>

      <BacklogTable
        title="Tareas activas"
        items={activeItems}
        sensors={sensors}
        onDragEnd={(e) => handleDragEnd(e, "active")}
        onToggle={toggleDone}
        onUpdate={updateItem}
        onRemove={removeItem}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="brandOutline" size="sm" onClick={addCustomTask}>
          + Agregar tarea
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={loadFullTemplate}>
          Cargar plantilla completa
        </Button>
      </div>

      <BacklogTable
        title="Completadas"
        items={doneItems}
        sensors={sensors}
        onDragEnd={(e) => handleDragEnd(e, "done")}
        onToggle={toggleDone}
        onUpdate={updateItem}
        onRemove={removeItem}
        completed
      />
    </div>
  );
}

function BacklogTable({
  title,
  items,
  sensors,
  onDragEnd,
  onToggle,
  onUpdate,
  onRemove,
  completed = false,
}: {
  title: string;
  items: BacklogItem[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onToggle: (id: string, done: boolean) => void;
  onUpdate: (id: string, patch: Partial<BacklogItem>) => void;
  onRemove: (id: string) => void;
  completed?: boolean;
}) {
  if (items.length === 0) {
    if (completed) return null;
    return (
      <p className="text-sm text-muted-foreground">Sin tareas activas. Agrega una con «+ Agregar tarea».</p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="font-heading text-sm font-semibold text-[#11233d]">{title}</h4>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="w-8 p-2" />
                  <th className="w-10 p-2" />
                  <th className="p-2">Tarea</th>
                  <th className="w-36 p-2">Fecha término</th>
                  <th className="w-44 p-2">Responsable</th>
                  <th className="w-8 p-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <SortableBacklogRow
                    key={item.id}
                    item={item}
                    completed={completed}
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableBacklogRow({
  item,
  completed,
  onToggle,
  onUpdate,
  onRemove,
}: {
  item: BacklogItem;
  completed: boolean;
  onToggle: (id: string, done: boolean) => void;
  onUpdate: (id: string, patch: Partial<BacklogItem>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b last:border-0 bg-background">
      <td className="p-2 align-top">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="cursor-grab text-muted-foreground hover:text-[#11233d] active:cursor-grabbing"
          aria-label="Reordenar tarea"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      <td className="p-2 align-top">
        <Checkbox
          checked={item.done}
          onCheckedChange={(checked) => onToggle(item.id, checked === true)}
        />
      </td>
      <td className="p-2 align-top">
        <Input
          value={item.titulo}
          className={cn(completed && "line-through opacity-70")}
          onChange={(e) => onUpdate(item.id, { titulo: e.target.value })}
        />
      </td>
      <td className="p-2 align-top">
        <Input
          type="date"
          value={item.fecha_termino ?? ""}
          onChange={(e) => onUpdate(item.id, { fecha_termino: e.target.value || null })}
        />
      </td>
      <td className="p-2 align-top">
        <TeamMemberSelect
          compact
          label="Responsable"
          value={item.responsable_user_id}
          displayName={item.responsable_display}
          onChange={(userId, nombre) =>
            onUpdate(item.id, {
              responsable_user_id: userId,
              responsable_display: nombre ? `@${nombre}` : null,
            })
          }
        />
      </td>
      <td className="p-2 align-top">
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.id)}
          aria-label="Eliminar tarea"
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}
