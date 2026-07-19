import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export interface MpSyncStatus {
  lastSyncAt: string | null;
  hasSyncedData: boolean;
  isFirstSync: boolean;
}

export async function getMpSyncStatus(): Promise<MpSyncStatus> {
  const supabase = createServiceClient();

  const [{ data: settings }, { count }] = await Promise.all([
    supabase
      .from("org_settings")
      .select("last_mp_sync_at")
      .eq("organization_id", DEFAULT_ORG_ID)
      .single(),
    supabase
      .from("processes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("synced_via_dashboard", true),
  ]);

  const lastSyncAt = settings?.last_mp_sync_at ?? null;

  return {
    lastSyncAt,
    hasSyncedData: (count ?? 0) > 0,
    isFirstSync: !lastSyncAt,
  };
}

export function formatLastSyncCL(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
