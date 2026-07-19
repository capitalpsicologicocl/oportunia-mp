import { createNotificationIfAbsent } from "@/lib/notifications/create";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

function normalizeRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

/** Marca procesos adjudicados al RUT de la org y crea notificaciones faltantes. */
export async function syncAdjudicadosAMi(): Promise<{
  updated: number;
  notificationsCreated: number;
}> {
  const supabase = createServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("rut, rut_dv")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  const orgRut = org?.rut
    ? normalizeRut(`${org.rut}${org.rut_dv ?? ""}`)
    : null;

  if (!orgRut) {
    return { updated: 0, notificationsCreated: 0 };
  }

  const { data: processes } = await supabase
    .from("processes")
    .select("id, codigo_externo, nombre, adjudicado_rut, adjudicado_a_mi")
    .eq("organization_id", DEFAULT_ORG_ID)
    .not("adjudicado_rut", "is", null);

  let updated = 0;
  let notificationsCreated = 0;

  for (const process of processes ?? []) {
    const adjRut = normalizeRut(process.adjudicado_rut);
    const isMine = adjRut === orgRut;

    if (isMine && !process.adjudicado_a_mi) {
      await supabase
        .from("processes")
        .update({ adjudicado_a_mi: true })
        .eq("id", process.id);
      updated += 1;
    } else if (!isMine && process.adjudicado_a_mi) {
      await supabase
        .from("processes")
        .update({ adjudicado_a_mi: false })
        .eq("id", process.id);
    }

    if (isMine) {
      const created = await createNotificationIfAbsent(supabase, {
        tipo: "adjudicacion_propia",
        titulo: "¡Adjudicado a ti!",
        mensaje: `El proceso ${process.codigo_externo} — ${process.nombre} fue adjudicado a tu empresa.`,
        process_id: process.id,
      });
      if (created) notificationsCreated += 1;
    }
  }

  return { updated, notificationsCreated };
}
