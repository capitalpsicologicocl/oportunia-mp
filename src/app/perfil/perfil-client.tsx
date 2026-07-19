"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFechaCL } from "@/lib/dashboard/format";
import type { NotificationRow } from "@/lib/notifications/queries";
import type { ProfileBacklogCard } from "@/app/api/profile/backlog/route";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import { cn } from "@/lib/utils";

interface StickyNote {
  id: string;
  title: string;
  body: string;
  color: string;
  sort_order: number;
}

interface UserTask {
  id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  sort_order: number;
}

const NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple"] as const;
type NoteColor = (typeof NOTE_COLORS)[number];

const NOTE_COLOR_CLASSES: Record<NoteColor, string> = {
  yellow: "bg-[#fef9c3] border-[#fde047]",
  pink: "bg-[#fce7f3] border-[#f9a8d4]",
  blue: "bg-[#dbeafe] border-[#93c5fd]",
  green: "bg-[#dcfce7] border-[#86efac]",
  purple: "bg-[#ede9fe] border-[#c4b5fd]",
};

const NOTE_COLOR_DOTS: Record<NoteColor, string> = {
  yellow: "bg-[#fde047]",
  pink: "bg-[#f9a8d4]",
  blue: "bg-[#93c5fd]",
  green: "bg-[#86efac]",
  purple: "bg-[#c4b5fd]",
};

const NOTE_INPUT_BG: Record<NoteColor, string> = {
  yellow: "bg-[#fef08a]/50",
  pink: "bg-[#fbcfe8]/50",
  blue: "bg-[#bfdbfe]/50",
  green: "bg-[#bbf7d0]/50",
  purple: "bg-[#ddd6fe]/50",
};

function noteColorClass(color: string): string {
  return NOTE_COLOR_CLASSES[color as NoteColor] ?? NOTE_COLOR_CLASSES.yellow;
}

function noteInputBg(color: string): string {
  return NOTE_INPUT_BG[color as NoteColor] ?? NOTE_INPUT_BG.yellow;
}

export function PerfilClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("tablero");
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreFantasia, setNombreFantasia] = useState("");
  const [rutDisplay, setRutDisplay] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [notepadContent, setNotepadContent] = useState("");
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [notepadStatus, setNotepadStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [mentions, setMentions] = useState<NotificationRow[]>([]);
  const [bandejaNotifications, setBandejaNotifications] = useState<NotificationRow[]>([]);
  const [backlogEnDesarrollo, setBacklogEnDesarrollo] = useState<ProfileBacklogCard[]>([]);
  const [backlogFinalizado, setBacklogFinalizado] = useState<ProfileBacklogCard[]>([]);

  const notepadInitial = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const loadWorkspace = useCallback(async () => {
    const res = await fetch("/api/profile/workspace");
    if (!res.ok) return;
    const data = (await res.json()) as {
      notes: StickyNote[];
      notepad: string;
      tasks: UserTask[];
    };
    setNotes(data.notes ?? []);
    setNotepadContent(data.notepad ?? "");
    setTasks(data.tasks ?? []);
    setWorkspaceLoaded(true);
    notepadInitial.current = true;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/onboarding").then((r) => r.json()),
      fetch("/api/auth/status").then((r) => r.json()),
      loadWorkspace(),
      fetch("/api/notifications?limit=5&tipo=mencion").then((r) => r.json()),
      fetch("/api/notifications?limit=30").then((r) => r.json()),
      fetch("/api/profile/backlog").then((r) => r.json()),
    ]).then(([orgData, authData, , notifMencion, notifAll, backlogData]) => {
      const org = orgData.organization;
      if (org) {
        setRazonSocial(org.razon_social ?? org.name ?? "");
        setNombreFantasia(org.nombre_fantasia ?? org.name ?? "");
        if (org.rut) setRutDisplay(`${org.rut}-${org.rut_dv ?? ""}`);
      }
      if (authData.user?.nombre) setUserName(authData.user.nombre);
      if (notifMencion.notifications) setMentions(notifMencion.notifications);
      if (notifAll.notifications) setBandejaNotifications(notifAll.notifications);
      if (backlogData.enDesarrollo) setBacklogEnDesarrollo(backlogData.enDesarrollo);
      if (backlogData.finalizado) setBacklogFinalizado(backlogData.finalizado);
    }).catch(() => undefined);
  }, [loadWorkspace]);

  useEffect(() => {
    return () => {
      for (const timer of noteSaveTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const saveNotepad = useCallback(async (content: string) => {
    setNotepadStatus("saving");
    try {
      const res = await fetch("/api/profile/notepad", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) setNotepadStatus("saved");
      else setNotepadStatus("idle");
    } catch {
      setNotepadStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) return;
    if (notepadInitial.current) {
      notepadInitial.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setNotepadStatus("idle");
    saveTimeoutRef.current = setTimeout(() => {
      void saveNotepad(notepadContent);
    }, 600);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [notepadContent, workspaceLoaded, saveNotepad]);

  async function handleSave() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/org/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razon_social: razonSocial, nombre_fantasia: nombreFantasia }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Perfil actualizado");
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function patchNoteLocal(id: string, patch: Partial<Pick<StickyNote, "title" | "body" | "color">>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function scheduleNoteSave(id: string, immediate = false) {
    const existing = noteSaveTimers.current.get(id);
    if (existing) clearTimeout(existing);

    const runSave = async () => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note) return;
      await fetch("/api/profile/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: note.id,
          title: note.title,
          body: note.body,
          color: note.color,
        }),
      });
    };

    if (immediate) {
      void runSave();
      return;
    }

    noteSaveTimers.current.set(
      id,
      setTimeout(() => {
        noteSaveTimers.current.delete(id);
        void runSave();
      }, 450)
    );
  }

  async function addNote() {
    const res = await fetch("/api/profile/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nueva nota", body: "", color: "yellow", sort_order: notes.length }),
    });
    const data = await res.json();
    if (res.ok && data.note) {
      setNotes((prev) => [...prev, data.note]);
      setEditingNoteId(data.note.id);
    }
  }

  async function deleteNote(id: string) {
    const timer = noteSaveTimers.current.get(id);
    if (timer) clearTimeout(timer);
    noteSaveTimers.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (editingNoteId === id) setEditingNoteId(null);
    await fetch("/api/profile/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  function finishEditingNote(id: string) {
    scheduleNoteSave(id, true);
    setEditingNoteId(null);
  }

  async function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    const res = await fetch("/api/profile/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sort_order: tasks.length }),
    });
    const data = await res.json();
    if (res.ok && data.task) {
      setTasks((prev) => [...prev, data.task]);
      setNewTaskTitle("");
    }
  }

  async function updateTask(id: string, patch: Partial<Pick<UserTask, "title" | "done" | "due_date">>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await fetch("/api/profile/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch("/api/profile/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="tablero" className="mt-0 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-[#11233d]">Notas adhesivas</h3>
              <Button variant="brandOutline" size="sm" onClick={addNote}>
                <Plus className="size-4" />
                Nota
              </Button>
            </div>
            {notes.length === 0 ? (
              <div className="rounded-xl border bg-[#fef9c3]/40 p-8 text-center text-sm text-muted-foreground">
                Sin notas. Pulsa «+ Nota» para crear una.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notes.map((note) => {
                  const isEditing = editingNoteId === note.id;
                  const colorCls = noteColorClass(note.color);
                  const inputBg = noteInputBg(note.color);
                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "relative flex min-h-[140px] flex-col rounded-xl border-2 p-4 shadow-sm transition-shadow hover:shadow-md",
                        colorCls
                      )}
                    >
                      <div className="absolute right-2 top-2 flex gap-1">
                        {!isEditing && (
                          <button
                            type="button"
                            className="rounded p-1 text-[#11233d]/50 hover:bg-black/5 hover:text-[#11233d]"
                            onClick={() => setEditingNoteId(note.id)}
                            aria-label="Editar nota"
                          >
                            <span className="text-xs font-medium">Editar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded p-1 text-[#11233d]/50 hover:bg-black/5 hover:text-destructive"
                          onClick={() => deleteNote(note.id)}
                          aria-label="Eliminar nota"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-1 flex-col gap-2 pt-4">
                          <Input
                            value={note.title}
                            onChange={(e) => {
                              patchNoteLocal(note.id, { title: e.target.value });
                              scheduleNoteSave(note.id);
                            }}
                            className={cn("border-[#11233d]/10 font-medium", inputBg)}
                            placeholder="Título"
                          />
                          <textarea
                            value={note.body}
                            onChange={(e) => {
                              patchNoteLocal(note.id, { body: e.target.value });
                              scheduleNoteSave(note.id);
                            }}
                            className={cn(
                              "min-h-[72px] flex-1 resize-none rounded-lg border border-[#11233d]/10 px-2.5 py-2 text-sm outline-none focus-visible:border-[#11233d]/30 focus-visible:ring-2 focus-visible:ring-[#d4a017]/40",
                              inputBg
                            )}
                            placeholder="Contenido…"
                          />
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1.5">
                              {NOTE_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={cn(
                                    "size-5 rounded-full border-2 border-transparent",
                                    NOTE_COLOR_DOTS[c],
                                    note.color === c && "border-[#11233d]"
                                  )}
                                  onClick={() => {
                                    patchNoteLocal(note.id, { color: c });
                                    scheduleNoteSave(note.id, true);
                                  }}
                                  aria-label={`Color ${c}`}
                                />
                              ))}
                            </div>
                            <Button variant="ghost" size="xs" onClick={() => finishEditingNote(note.id)}>
                              <X className="size-3" />
                              Listo
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex flex-1 flex-col items-start pt-4 text-left"
                          onClick={() => setEditingNoteId(note.id)}
                        >
                          <p className="font-heading font-semibold text-[#11233d]">
                            {note.title || "Sin título"}
                          </p>
                          {note.body && (
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-[#11233d]/80">
                              {note.body}
                            </p>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="brand-card space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-[#11233d]">Bloc de notas</h3>
              {notepadStatus === "saving" && (
                <span className="text-xs text-muted-foreground">Guardando…</span>
              )}
              {notepadStatus === "saved" && (
                <span className="text-xs text-muted-foreground">Guardado</span>
              )}
            </div>
            <textarea
              value={notepadContent}
              onChange={(e) => setNotepadContent(e.target.value)}
              onBlur={() => void saveNotepad(notepadContent)}
              className="min-h-[160px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Escribe aquí tus apuntes personales…"
            />
          </section>

          <section className="space-y-4">
            <h3 className="font-heading text-lg font-semibold text-[#11233d]">Mis backlogs</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="brand-card space-y-3 p-4">
                <h4 className="font-heading text-sm font-semibold text-[#11233d]">En desarrollo</h4>
                {backlogEnDesarrollo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin tareas asignadas pendientes.</p>
                ) : (
                  <ul className="space-y-3">
                    {backlogEnDesarrollo.map((entry) => (
                      <li key={entry.cardId} className="rounded-lg border border-[#d4a017]/30 p-3 text-sm">
                        <div className="mb-2">
                          <p className="font-mono text-xs text-[#d4a017]">{entry.codigo}</p>
                          <p className="font-medium text-[#11233d]">{entry.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.columnaLabel}
                            {entry.estado_interno ? ` · ${entry.estado_interno}` : ""}
                            {entry.fecha_cierre ? ` · Cierre ${formatFechaCL(entry.fecha_cierre)}` : ""}
                          </p>
                        </div>
                        <ul className="space-y-1 text-xs">
                          {entry.items.map((item) => (
                            <li key={item.id} className="flex items-center gap-2">
                              <span className="size-1.5 shrink-0 rounded-full bg-[#d4a017]" />
                              {item.titulo}
                              {item.fecha_termino && (
                                <span className="text-muted-foreground">· {formatFechaCL(item.fecha_termino)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={`/kanban?card=${entry.cardId}`}
                          className="mt-2 inline-block text-xs font-medium text-[#d4a017] hover:underline"
                        >
                          Ver tarjeta →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="brand-card space-y-3 p-4">
                <h4 className="font-heading text-sm font-semibold text-[#11233d]">Finalizado</h4>
                {backlogFinalizado.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin tareas completadas.</p>
                ) : (
                  <ul className="space-y-3">
                    {backlogFinalizado.map((entry) => (
                      <li key={entry.cardId} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                        <div className="mb-2">
                          <p className="font-mono text-xs text-muted-foreground">{entry.codigo}</p>
                          <p className="font-medium text-[#11233d]">{entry.nombre}</p>
                          <p className="text-xs text-muted-foreground">{KANBAN_COLUMN_LABELS[entry.columna]}</p>
                        </div>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {entry.items.map((item) => (
                            <li key={item.id} className="line-through">{item.titulo}</li>
                          ))}
                        </ul>
                        <Link
                          href={`/kanban?card=${entry.cardId}`}
                          className="mt-2 inline-block text-xs font-medium text-[#d4a017] hover:underline"
                        >
                          Ver tarjeta →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="brand-card space-y-4 p-6">
            <h3 className="font-heading text-lg font-semibold text-[#11233d]">Tareas</h3>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <Checkbox
                      checked={task.done}
                      onCheckedChange={(checked) => updateTask(task.id, { done: checked === true })}
                    />
                    <Input
                      value={task.title}
                      onChange={(e) => updateTask(task.id, { title: e.target.value })}
                      className={cn("flex-1 border-0 bg-transparent shadow-none", task.done && "line-through opacity-60")}
                    />
                    <Input
                      value={task.due_date ?? ""}
                      onChange={(e) => updateTask(task.id, { due_date: e.target.value || null })}
                      placeholder="Fecha"
                      className="w-28 border-0 bg-transparent text-xs shadow-none"
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteTask(task.id)}
                      aria-label="Eliminar tarea"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Nueva tarea…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addTask();
                }}
              />
              <Button variant="brand" size="sm" onClick={addTask} disabled={!newTaskTitle.trim()}>
                <Plus className="size-4" />
                Agregar
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="bandeja" className="mt-0 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-semibold text-[#11233d]">Bandeja de entrada</h3>
            <Link href="/bandeja" className="text-sm font-medium text-[#d4a017] hover:underline">
              Abrir bandeja completa →
            </Link>
          </div>
          {bandejaNotifications.length === 0 ? (
            <div className="brand-card p-8 text-center text-sm text-muted-foreground">
              No hay notificaciones en la bandeja.
            </div>
          ) : (
            <ul className="space-y-2">
              {bandejaNotifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "brand-card p-4 text-sm",
                    !n.leida && "border-[#d4a017]/40 bg-[#d4a017]/5"
                  )}
                >
                  <p className="font-medium text-[#11233d]">{n.titulo}</p>
                  <p className="text-muted-foreground">{n.mensaje}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatFechaCL(n.created_at)}</p>
                  {n.kanban_card_id && (
                    <Link
                      href={`/kanban?card=${n.kanban_card_id}`}
                      className="mt-2 inline-block text-xs font-medium text-[#d4a017] hover:underline"
                    >
                      Ver tarjeta →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {mentions.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-heading text-sm font-semibold text-[#11233d]">Menciones recientes</h4>
              <ul className="space-y-2">
                {mentions.map((mention) => (
                  <li
                    key={mention.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      mention.leida ? "border-border/60 bg-muted/20" : "border-[#d4a017]/40 bg-[#d4a017]/5"
                    )}
                  >
                    <p className="font-medium text-[#11233d]">{mention.titulo}</p>
                    <p className="text-muted-foreground">{mention.mensaje}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="perfil" className="mt-0">
          <div className="mx-auto max-w-lg">
            <div className="brand-card overflow-hidden">
              <div className="bg-[#11233d] px-6 py-8 text-center">
                <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-[#d4a017] text-2xl font-bold text-[#11233d]">
                  {(userName?.[0] ?? "U").toUpperCase()}
                </div>
                <h2 className="font-heading text-xl font-semibold text-white">{userName || "Usuario"}</h2>
                <p className="mt-1 text-sm text-white/70">{nombreFantasia || "Empresa"}</p>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <div className="space-y-1">
                  <Label>Razón social</Label>
                  <Input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Nombre de fantasía (banner)</Label>
                  <Input value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">RUT empresa</p>
                  <p className="font-medium">{rutDisplay || "No configurado"}</p>
                </div>
                {status && (
                  <Alert>
                    <AlertDescription>{status}</AlertDescription>
                  </Alert>
                )}
                <Button variant="brand" disabled={loading} onClick={handleSave}>
                  {loading ? "Guardando…" : "Guardar perfil"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="config" className="mt-0">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="brand-card p-6">
              <h3 className="font-heading text-lg font-semibold text-[#11233d]">Configuración y usuarios</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Administra usuarios del equipo (hasta 5), API keys de Anthropic y ChileCompra, rubros y keywords de búsqueda.
              </p>
              <Link href="/ajustes" className="mt-4 block">
                <Button variant="brand" className="w-full">
                  Ir a configuración
                </Button>
              </Link>
            </div>
            <Link href="/compra-agil">
              <Button variant="outline" className="w-full">Volver al Dashboard</Button>
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
