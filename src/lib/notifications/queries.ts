import { createServiceClient } from "@/lib/supabase/server";
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
}

export async function getUnreadCount(): Promise<number> {
  const notifications = await getNotifications({ soloNoLeidas: true, limit: 200 });
  return notifications.length;
}

export async function getNotifications(options?: {
  soloNoLeidas?: boolean;
  limit?: number;
}): Promise<NotificationRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("notifications")
    .select(
      `
      id,
      tipo,
      titulo,
      mensaje,
      leida,
      created_at,
      process_id,
      processes (
        id,
        codigo_externo,
        url_publica,
        nombre,
        servicios_requeridos,
        adjudicado_a_mi
      )
    `
    )
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
    .map((row) => {
      const process = row.processes as
        | {
            id: string;
            codigo_externo: string;
            url_publica: string | null;
            nombre: string;
            servicios_requeridos: string | null;
            adjudicado_a_mi: boolean;
          }
        | {
            id: string;
            codigo_externo: string;
            url_publica: string | null;
            nombre: string;
            servicios_requeridos: string | null;
            adjudicado_a_mi: boolean;
          }[]
        | null;
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
        _process: p,
      };
    })
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

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("notifications")
    .update({ leida: true })
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ leida: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("leida", false)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
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
