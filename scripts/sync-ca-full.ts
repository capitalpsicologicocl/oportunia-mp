/**
 * Actualización completa de Compra Ágil abiertas (GitHub Actions o máquina local).
 *
 *   MP_CA_ALL_OPEN=1 npx tsx --env-file=.env.local scripts/sync-ca-full.ts
 */
import { createServiceClient } from "../src/lib/supabase/server";
import { archiveStaleDashboardProcesses } from "../src/lib/dashboard/archive-processes";
import { recordCronAttempt, recordCronFailure, runDashboardSyncBatch } from "../src/lib/ingest/service";
import { DEFAULT_ORG_ID } from "../src/types/database";

type CaPending = {
  ca_term_offset?: number;
  ca_search_terms?: string[];
  finalized?: boolean;
  errors?: string[];
  created?: number;
  updated?: number;
};

async function loadPending(): Promise<CaPending | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("mp_sync_pending_ca")
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  if (error) throw new Error(error.message);
  const raw = (data as { mp_sync_pending_ca?: unknown } | null)?.mp_sync_pending_ca;
  if (!raw || typeof raw !== "object") return null;
  return raw as CaPending;
}

async function countOpenCa(): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("processes")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "compra_agil")
    .eq("synced_via_dashboard", true)
    .is("dashboard_archived_at", null)
    .ilike("estado", "publicada");
  return count ?? 0;
}

async function main() {
  const maxMinutes = Number.parseInt(process.env.SYNC_MAX_MINUTES ?? "22", 10);
  const deadline = Date.now() + maxMinutes * 60_000;
  process.env.SYNC_VERBOSE = process.env.SYNC_VERBOSE ?? "1";
  process.env.MP_CA_ALL_OPEN = process.env.MP_CA_ALL_OPEN ?? "1";

  await recordCronAttempt();
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from("org_settings")
    .update({
      mp_sync_pending_ca: null,
      last_cron_error: null,
      last_cron_summary: {
        partial: true,
        created: 0,
        updated: 0,
        archived: 0,
        cronCaPasses: 0,
        mpError: null,
        at: nowIso,
        source: "github_running",
      },
      updated_at: nowIso,
    })
    .eq("organization_id", DEFAULT_ORG_ID);

  const before = await countOpenCa();
  console.log(`CA Publicadas en dashboard: ${before}`);

  let created = 0;
  let updated = 0;
  let passes = 0;
  let continueBatch = false;
  let wrapped = false;
  let maxOffset = 0;
  const errors: string[] = [];

  while (Date.now() < deadline - 8_000 && passes < 16 && !wrapped) {
    passes += 1;
    const result = await runDashboardSyncBatch({
      continueBatch,
      scope: "compra_agil",
      cron: false,
      serverSide: true,
      maxBatchMs: 170_000,
    });
    continueBatch = true;
    created = result.summary.created;
    updated = result.summary.updated;
    errors.push(...(result.summary.errors ?? []));

    const pending = await loadPending();
    const offset = pending?.ca_term_offset ?? 0;
    const terms = pending?.ca_search_terms?.length ?? 0;
    if (offset > maxOffset) maxOffset = offset;
    console.log(
      `Pasada ${passes}: total ${created} nuevos / ${updated} act.` +
        ` · keywords ${offset}/${terms}` +
        (result.summary.errors?.length ? ` · ${result.summary.errors.length} avisos` : "")
    );
    for (const err of (result.summary.errors ?? []).slice(0, 4)) {
      console.log(`  - ${err}`);
    }
    if (terms > 0 && offset >= terms) wrapped = true;
    if (terms > 0 && maxOffset > 0 && offset < maxOffset && maxOffset >= terms - 1) {
      wrapped = true;
    }
  }

  const { archived } = await archiveStaleDashboardProcesses().catch(() => ({ archived: 0 }));
  const after = await countOpenCa();
  const mpError =
    errors.find((e) => /chilecompra|timeout|504|503|502|no respondió/i.test(e)) ?? null;

  const finishedAt = new Date().toISOString();
  await supabase
    .from("org_settings")
    .update({
      last_mp_sync_at: finishedAt,
      last_mp_sync_ca_at: finishedAt,
      ...(process.env.SYNC_TRIGGER === "schedule"
        ? { last_mp_sync_ca_cron_at: finishedAt }
        : { last_mp_sync_ca_manual_at: finishedAt }),
      last_cron_summary: {
        partial: !wrapped,
        fetched: created + updated,
        created,
        updated,
        archived,
        cronCaPasses: passes,
        mpError: wrapped ? null : (mpError?.slice(0, 200) ?? null),
        at: finishedAt,
        source: "github_action",
      },
      last_cron_error: wrapped ? null : (mpError?.slice(0, 500) ?? null),
      updated_at: finishedAt,
      ...(wrapped ? { mp_sync_pending_ca: null } : {}),
    })
    .eq("organization_id", DEFAULT_ORG_ID);

  console.log("———");
  console.log(`Ciclo keywords: ${wrapped ? "completo" : "incompleto"} · pasadas ${passes}`);
  console.log(`Nuevos ${created} · actualizados ${updated} · archivados ${archived}`);
  console.log(`CA Publicadas en dashboard: ${before} → ${after}`);
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  await recordCronFailure(message).catch(() => undefined);
  process.exit(1);
});
