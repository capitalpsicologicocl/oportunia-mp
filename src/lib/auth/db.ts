import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function orgHasUsers(): Promise<boolean> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("org_users")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("activo", true);

  if (error) {
    // Tabla aún no migrada → tratar como sin usuarios
    if (error.code === "42P01" || error.message.includes("org_users")) return false;
    throw error;
  }
  return (count ?? 0) > 0;
}
