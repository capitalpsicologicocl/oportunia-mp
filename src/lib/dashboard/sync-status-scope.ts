import { createServiceClient } from "@/lib/supabase/server";
import { formatLastSyncCL } from "@/lib/dashboard/sync-status";
import type { SyncScope } from "@/lib/ingest/sync-refresh";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function getMpSyncStatusForScope(
  scope: Exclude<SyncScope, "all">
): Promise<{
  lastSyncAt: string | null;
  hasSyncedData: boolean;
  isFirstSync: boolean;
  lastSyncLabel: string;
}> {
  const supabase = createServiceClient();
  const lastCol = scope === "compra_agil" ? "last_mp_sync_ca_at" : "last_mp_sync_lic_at";
  const tipo = scope === "compra_agil" ? "compra_agil" : "licitacion";

  const [{ data: settings }, { count }] = await Promise.all([
    supabase
      .from("org_settings")
      .select(`${lastCol}, last_mp_sync_at`)
      .eq("organization_id", DEFAULT_ORG_ID)
      .single(),
    supabase
      .from("processes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("synced_via_dashboard", true)
      .eq("tipo", tipo)
      .is("dashboard_archived_at", null),
  ]);

  const row = settings as Record<string, string | null> | null;
  const lastSyncAt = row?.[lastCol] ?? row?.last_mp_sync_at ?? null;

  return {
    lastSyncAt,
    hasSyncedData: (count ?? 0) > 0,
    isFirstSync: !lastSyncAt,
    lastSyncLabel: formatLastSyncCL(lastSyncAt),
  };
}
