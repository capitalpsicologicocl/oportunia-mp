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
  pendingQueueLabel: string | null;
  cronImportStale: boolean;
  cronMpError: string | null;
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
  const pendingCol = scope === "compra_agil" ? "mp_sync_pending_ca" : "mp_sync_pending_lic";
  const tipo = scope === "compra_agil" ? "compra_agil" : "licitacion";

  const [{ data: settings }, { count }] = await Promise.all([
    supabase
      .from("org_settings")
      .select(
        `${lastCol}, ${manualCol}, ${cronCol}, last_mp_sync_at, last_cron_attempt_at, last_cron_error, last_cron_summary, ${pendingCol}`
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
    mpError?: string | null;
    at?: string;
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
        ? "sin importaciones en la última corrida"
        : null;

  const pendingRaw = row?.[pendingCol] as
    | {
        ca_fetched?: boolean;
        ca_term_offset?: number;
        ca_search_terms?: string[];
        ca_list_page?: number;
        index?: number;
        candidates?: unknown[];
        finalized?: boolean;
        errors?: string[];
      }
    | null
    | undefined;

  const pendingMpError =
    pendingRaw?.errors?.find((e) => /chilecompra|timeout|504|503|502|no respondió/i.test(e)) ??
    null;
  const cronMpError = cronSummary?.mpError ?? pendingMpError ?? lastCronError;

  const cronImportStale = Boolean(
    lastCronAttemptAt &&
      lastCronSyncAt &&
      new Date(lastCronAttemptAt).getTime() - new Date(lastCronSyncAt).getTime() > 3 * 60 * 60 * 1000
  );

  let pendingQueueLabel: string | null = null;
  if (pendingRaw && !pendingRaw.finalized) {
    if (scope === "compra_agil" && pendingRaw.ca_fetched === false) {
      const terms = pendingRaw.ca_search_terms?.length ?? 0;
      const offset = pendingRaw.ca_term_offset ?? 0;
      const listPage = pendingRaw.ca_list_page ?? 1;
      pendingQueueLabel = `Rotación CA: keywords ${Math.min(offset, terms)}/${terms} · listado pág. ${listPage} (avance normal)`;
    } else {
      const total = pendingRaw.candidates?.length ?? 0;
      const idx = pendingRaw.index ?? 0;
      pendingQueueLabel = `Cola: ${idx}/${total} procesados`;
    }
  }

  return {
    lastSyncAt,
    lastManualSyncAt,
    lastCronSyncAt,
    lastCronAttemptAt,
    lastCronError,
    lastCronSummaryPartial,
    lastCronSummaryText,
    pendingQueueLabel,
    cronImportStale,
    cronMpError,
    hasSyncedData: (count ?? 0) > 0,
    isFirstSync: !lastSyncAt,
    lastSyncLabel: formatLastSyncCL(lastSyncAt),
    lastManualSyncLabel: formatLastSyncCL(lastManualSyncAt),
    lastCronSyncLabel: formatLastSyncCL(lastCronSyncAt),
    lastCronAttemptLabel: formatLastSyncCL(lastCronAttemptAt),
  };
}
