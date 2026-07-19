import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

type NotificationTipo = "adjudicacion_propia" | "estado_cambio" | "api_key_error" | "ingesta_error";

interface CreateNotificationParams {
  organization_id?: string;
  tipo: NotificationTipo;
  titulo: string;
  mensaje: string;
  process_id: string;
}

/** Inserta una notificación solo si no existe una igual (mismo proceso, tipo y mensaje). */
export async function createNotificationIfAbsent(
  supabase: ReturnType<typeof createServiceClient>,
  params: CreateNotificationParams
): Promise<boolean> {
  const orgId = params.organization_id ?? DEFAULT_ORG_ID;

  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("process_id", params.process_id)
    .eq("tipo", params.tipo);

  if (params.tipo === "estado_cambio") {
    query = query.eq("mensaje", params.mensaje);
  }

  const { count } = await query;
  if (count && count > 0) return false;

  const { error } = await supabase.from("notifications").insert({
    organization_id: orgId,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje,
    process_id: params.process_id,
  });

  if (error) throw new Error(error.message);
  return true;
}

/** Elimina notificaciones duplicadas, conservando la más antigua de cada grupo. */
export async function dedupeNotifications(): Promise<{ removed: number }> {
  const supabase = createServiceClient();

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, process_id, tipo, mensaje, created_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("created_at", { ascending: true });

  const seen = new Set<string>();
  const toDelete: string[] = [];

  for (const row of rows ?? []) {
    const key = `${row.process_id ?? "null"}|${row.tipo}|${row.mensaje}`;
    if (seen.has(key)) {
      toDelete.push(row.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length === 0) return { removed: 0 };

  const { error } = await supabase.from("notifications").delete().in("id", toDelete);
  if (error) throw new Error(error.message);

  return { removed: toDelete.length };
}

/** Elimina avisos de cambio de estado (solo se usan adjudicaciones en bandeja). */
export async function deleteEstadoCambioNotifications(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "estado_cambio")
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
