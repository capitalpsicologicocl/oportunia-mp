import { createServiceClient } from "@/lib/supabase/server";
import { formatLastSyncCL } from "@/lib/dashboard/sync-status";
import type { SyncScope } from "@/lib/ingest/sync-refresh";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function getMpSyncStatusForScope(
  scope: Exclude<SyncScope, "all">
): Promise<{
  lastSyncAt: string | null;
  lastManualSyncAt: string | null;
  lastCronSyncAt: string | null;
  lastCronAttemptAt: string | null;
  lastCronError: string | null;
  lastCronSummaryPartial: boolean | null;
  lastCronSummaryText: string | null;
  hasSyncedData: boolean;
  isFirstSync: boolean;
  lastSyncLabel: string;
  lastManualSyncLabel: string;
  lastCronSyncLabel: string;
  lastCronAttemptLabel: string;
}> {
  const supabase = createServiceClient();
  const lastCol = scope === "compra_agil" ? "last_mp_sync_ca_at" : "last_mp_sync_lic_at";
  const manualCol =
    scope === "compra_agil" ? "last_mp_sync_ca_manual_at" : "last_mp_sync_lic_manual_at";
  const cronCol = scope === "compra_agil" ? "last_mp_sync_ca_cron_at" : "last_mp_sync_lic_cron_at";
  const tipo = scope === "compra_agil" ? "compra_agil" : "licitacion";

  const [{ data: settings }, { count }] = await Promise.all([
    supabase
      .from("org_settings")
      .select(
        `${lastCol}, ${manualCol}, ${cronCol}, last_mp_sync_at, last_cron_attempt_at, last_cron_error, last_cron_summary`
      )
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
  const lastManualSyncAt = row?.[manualCol] ?? null;
  const lastCronSyncAt = row?.[cronCol] ?? null;
  const lastCronAttemptAt = (row?.last_cron_attempt_at as string | null) ?? null;
  const lastCronError = (row?.last_cron_error as string | null) ?? null;
  const cronSummary = row?.last_cron_summary as {
    partial?: boolean;
    created?: number;
    updated?: number;
    archived?: number;
  } | null;
  const lastCronSummaryPartial =
    typeof cronSummary?.partial === "boolean" ? cronSummary.partial : null;

  const summaryParts: string[] = [];
  if (cronSummary?.created) summaryParts.push(`${cronSummary.created} nuevos`);
  if (cronSummary?.updated) summaryParts.push(`${cronSummary.updated} actualizados`);
  if (cronSummary?.archived) summaryParts.push(`${cronSummary.archived} archivados`);
  const lastCronSummaryText =
    summaryParts.length > 0
      ? `${lastCronSummaryPartial ? "parcial · " : ""}${summaryParts.join(" · ")}`
      : lastCronSummaryPartial
        ? "parcial (cola pendiente)"
        : null;

  return {
    lastSyncAt,
    lastManualSyncAt,
    lastCronSyncAt,
    lastCronAttemptAt,
    lastCronError,
    lastCronSummaryPartial,
    lastCronSummaryText,
    hasSyncedData: (count ?? 0) > 0,
    isFirstSync: !lastSyncAt,
    lastSyncLabel: formatLastSyncCL(lastSyncAt),
    lastManualSyncLabel: formatLastSyncCL(lastManualSyncAt),
    lastCronSyncLabel: formatLastSyncCL(lastCronSyncAt),
    lastCronAttemptLabel: formatLastSyncCL(lastCronAttemptAt),
  };
}
