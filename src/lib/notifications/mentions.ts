import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export interface CreateMentionNotificationParams {
  userId: string;
  kanbanCardId: string;
  processId: string;
  assignerName: string;
  processCodigo: string;
  processNombre: string;
}

export async function createMentionNotification(
  params: CreateMentionNotificationParams
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("notifications").insert({
    organization_id: DEFAULT_ORG_ID,
    user_id: params.userId,
    tipo: "mencion",
    titulo: "Te asignaron como responsable",
    mensaje: `${params.assignerName} te asignó en ${params.processCodigo} — ${params.processNombre}`,
    process_id: params.processId,
    kanban_card_id: params.kanbanCardId,
  });
  if (error) throw new Error(error.message);
}
