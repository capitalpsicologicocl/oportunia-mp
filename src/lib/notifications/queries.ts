import { createServiceClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth/session";
import { isProcessRelevant, loadOrgContentFilters } from "@/lib/dashboard/process-relevance";
import { DEFAULT_ORG_ID } from "@/types/database";

export interface NotificationRow {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  process_id: string | null;
  process_codigo: string | null;
  process_url: string | null;
  process_nombre: string | null;
  kanban_card_id: string | null;
  from_user_name: string | null;
}

const NOTIFICATION_SELECT = `
  id,
  tipo,
  titulo,
  mensaje,
  leida,
  created_at,
  process_id,
  kanban_card_id,
  processes (
    id,
    codigo_externo,
    url_publica,
    nombre,
    servicios_requeridos,
    adjudicado_a_mi
  )
`;

type ProcessJoin = {
  id: string;
  codigo_externo: string;
  url_publica: string | null;
  nombre: string;
  servicios_requeridos: string | null;
  adjudicado_a_mi: boolean;
};

function parseFromUserName(mensaje: string): string | null {
  const match = mensaje.match(/^(.+?) te asignó en /);
  return match?.[1]?.trim() ?? null;
}

function mapNotificationRow(row: {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  process_id: string | null;
  kanban_card_id?: string | null;
  processes: ProcessJoin | ProcessJoin[] | null;
}): NotificationRow & { _process: ProcessJoin | null } {
  const process = row.processes;
  const p = Array.isArray(process) ? process[0] : process;

  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje,
    leida: row.leida,
    created_at: row.created_at,
    process_id: row.process_id,
    process_codigo: p?.codigo_externo ?? null,
    process_url: p?.url_publica ?? null,
    process_nombre: p?.nombre ?? null,
    kanban_card_id: row.kanban_card_id ?? null,
    from_user_name: row.tipo === "mencion" ? parseFromUserName(row.mensaje) : null,
    _process: p ?? null,
  };
}

async function fetchAdjudicacionNotifications(options?: {
  soloNoLeidas?: boolean;
  limit?: number;
}): Promise<NotificationRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "adjudicacion_propia")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.soloNoLeidas) {
    query = query.eq("leida", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filters = await loadOrgContentFilters();

  return (data ?? [])
    .map((row) => mapNotificationRow(row as Parameters<typeof mapNotificationRow>[0]))
    .filter((row) => {
      if (!row._process) return true;
      return isProcessRelevant(
        {
          id: row._process.id,
          nombre: row._process.nombre,
          servicios_requeridos: row._process.servicios_requeridos,
          adjudicado_a_mi: row._process.adjudicado_a_mi,
        },
        filters
      );
    })
    .map(({ _process, ...row }) => row);
}

async function fetchMentionNotifications(
  userId: string,
  options?: { soloNoLeidas?: boolean; limit?: number }
): Promise<NotificationRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "mencion")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.soloNoLeidas) {
    query = query.eq("leida", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => mapNotificationRow(row as Parameters<typeof mapNotificationRow>[0]))
    .map(({ _process, ...row }) => row);
}

export async function getNotifications(options?: {
  soloNoLeidas?: boolean;
  limit?: number;
  session?: SessionUser | null;
  tipo?: "mencion" | "all";
}): Promise<NotificationRow[]> {
  const limit = options?.limit ?? 100;
  const session = options?.session;

  if (options?.tipo === "mencion") {
    if (!session) return [];
    return fetchMentionNotifications(session.userId, {
      soloNoLeidas: options.soloNoLeidas,
      limit,
    });
  }

  const [adjudicaciones, menciones] = await Promise.all([
    fetchAdjudicacionNotifications({ soloNoLeidas: options?.soloNoLeidas, limit }),
    session
      ? fetchMentionNotifications(session.userId, { soloNoLeidas: options?.soloNoLeidas, limit })
      : Promise.resolve([] as NotificationRow[]),
  ]);

  return [...adjudicaciones, ...menciones]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function getUnreadCount(session?: SessionUser | null): Promise<number> {
  const [adjudicaciones, menciones] = await Promise.all([
    fetchAdjudicacionNotifications({ soloNoLeidas: true, limit: 200 }),
    session ? fetchMentionNotifications(session.userId, { soloNoLeidas: true, limit: 200 }) : Promise.resolve([]),
  ]);
  return adjudicaciones.length + menciones.length;
}

export async function markNotificationRead(id: string, session?: SessionUser | null): Promise<void> {
  const supabase = createServiceClient();

  const { data: notification, error: fetchError } = await supabase
    .from("notifications")
    .select("id, tipo, user_id")
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!notification) throw new Error("Notificación no encontrada");

  if (notification.tipo === "mencion") {
    if (!session || notification.user_id !== session.userId) {
      throw new Error("No autorizado");
    }
  }

  const { error } = await supabase
    .from("notifications")
    .update({ leida: true })
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(session?: SessionUser | null): Promise<number> {
  const supabase = createServiceClient();
  let marked = 0;

  const { data: adjudicaciones, error: adjError } = await supabase
    .from("notifications")
    .update({ leida: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "adjudicacion_propia")
    .eq("leida", false)
    .select("id");
  if (adjError) throw new Error(adjError.message);
  marked += adjudicaciones?.length ?? 0;

  if (session) {
    const { data: menciones, error: menError } = await supabase
      .from("notifications")
      .update({ leida: true })
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("tipo", "mencion")
      .eq("user_id", session.userId)
      .eq("leida", false)
      .select("id");
    if (menError) throw new Error(menError.message);
    marked += menciones?.length ?? 0;
  }

  return marked;
}

/** Cuenta procesos adjudicados al RUT de la organización (para badge dashboard). */
export async function countAdjudicadosAMi(): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("processes")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("adjudicado_a_mi", true);
  return count ?? 0;
}
