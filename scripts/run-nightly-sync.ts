/**
 * Sync nocturna completa desde tu máquina (sin el límite de ~60 s de Vercel).
 * Usa la misma base de producción (.env.local) y retoma la cola pendiente.
 *
 *   npm run sync:nightly
 */
import { createServiceClient } from "../src/lib/supabase/server";
import {
  recordCronAttempt,
  recordCronFailure,
  runDashboardSyncBatch,
} from "../src/lib/ingest/service";
import { DEFAULT_ORG_ID } from "../src/types/database";

type CaPending = {
  ca_term_offset?: number;
  ca_search_terms?: string[];
  ca_list_page?: number;
  errors?: string[];
  finalized?: boolean;
  index?: number;
  candidates?: unknown[];
};

async function loadPending(scope: "compra_agil" | "licitacion"): Promise<CaPending | null> {
  const supabase = createServiceClient();
  const col = scope === "compra_agil" ? "mp_sync_pending_ca" : "mp_sync_pending_lic";
  const { data, error } = await supabase
    .from("org_settings")
    .select(col)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  if (error) throw new Error(error.message);
  const raw = (data as Record<string, unknown> | null)?.[col];
  if (!raw || typeof raw !== "object") return null;
  return raw as CaPending;
}

function logPending(label: string, pending: CaPending | null) {
  if (!pending) {
    console.log(`${label}: sin cola`);
    return;
  }
  const terms = pending.ca_search_terms?.length ?? 0;
  const offset = pending.ca_term_offset ?? 0;
  console.log(
    `${label}: keywords ${Math.min(offset, terms)}/${terms}` +
      ` · listado pág. ${pending.ca_list_page ?? 1}` +
      ` · cola ${pending.index ?? 0}/${pending.candidates?.length ?? 0}` +
      (pending.errors?.length ? ` · ${pending.errors.length} avisos` : "")
  );
}

async function countCa(): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("processes")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("tipo", "compra_agil")
    .is("dashboard_archived_at", null);
  return count ?? 0;
}

async function main() {
  const maxMinutes = Number.parseInt(process.env.SYNC_MAX_MINUTES ?? "35", 10);
  const deadline = Date.now() + maxMinutes * 60_000;
  process.env.MP_SYNC_MAX_ATTEMPTS = process.env.MP_SYNC_MAX_ATTEMPTS ?? "2";
  process.env.MP_KEYWORD_MAX_ATTEMPTS = process.env.MP_KEYWORD_MAX_ATTEMPTS ?? "1";
  process.env.MP_FETCH_TIMEOUT_MS = process.env.MP_FETCH_TIMEOUT_MS ?? "12000";
  process.env.MP_CA_PAGES_PER_KEYWORD = process.env.MP_CA_PAGES_PER_KEYWORD ?? "1";
  process.env.SYNC_VERBOSE = process.env.SYNC_VERBOSE ?? "1";

  console.log(`Inicio sync nocturna local (máx. ${maxMinutes} min, reintentos MP=${process.env.MP_SYNC_MAX_ATTEMPTS})`);
  await recordCronAttempt();

  const caBefore = await countCa();
  const caPendingStart = await loadPending("compra_agil");
  logPending("Cola CA inicial", caPendingStart);
  logPending("Cola LIC inicial", await loadPending("licitacion"));
  console.log(`CA activas en dashboard: ${caBefore}`);
  const resumeCa = Boolean(
    caPendingStart &&
      !caPendingStart.finalized &&
      (caPendingStart.ca_search_terms?.length ?? 0) > 0
  );
  let caContinue = resumeCa;
  console.log(resumeCa ? "Retomando cola CA (sin reiniciar keywords)." : "Ciclo CA nuevo.");

  let created = 0;
  let updated = 0;
  let fetched = 0;
  const errors: string[] = [];
  let listingOk = false;
  let keywordsWrapped = false;
  let maxKeywordOffset = 0;
  let caPasses = 0;
  let consecutiveListingFails = 0;
  let didWorkPass = false;

  const hasTime = () => Date.now() < deadline - 8_000;
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    console.log(`… sync en curso (${Math.round((Date.now() - startedAt) / 1000)}s)`);
  }, 20_000);

  try {

  while (hasTime() && caPasses < 24 && !(didWorkPass && keywordsWrapped && listingOk)) {
    caPasses += 1;
    const result = await runDashboardSyncBatch({
      continueBatch: caContinue,
      scope: "compra_agil",
      cron: false,
      serverSide: true,
      maxBatchMs: 55_000,
    });
    caContinue = true;

    created += result.summary.created;
    updated += result.summary.updated;
    fetched = Math.max(fetched, result.summary.fetched);
    const newErrors = result.summary.errors ?? [];
    errors.push(...newErrors);

    const pendingAfter = await loadPending("compra_agil");
    const offset = pendingAfter?.ca_term_offset ?? 0;
    const terms = pendingAfter?.ca_search_terms?.length ?? 0;
    const isInitPass = result.phase === "compra_agil" && result.summary.created === 0 && result.summary.updated === 0 && offset === 0 && !didWorkPass;

    if (!isInitPass) {
      didWorkPass = true;
      const listingFail = newErrors.some((e) => /listado reciente|no respondió/i.test(e));
      if (listingFail) {
        consecutiveListingFails += 1;
      } else {
        listingOk = true;
        consecutiveListingFails = 0;
      }
      if (offset >= maxKeywordOffset) maxKeywordOffset = offset;
      if (terms > 0 && (offset >= terms || (maxKeywordOffset > 0 && offset < maxKeywordOffset))) {
        keywordsWrapped = true;
      }
      if (terms > 0 && maxKeywordOffset >= terms) keywordsWrapped = true;

      console.log(
        `CA pasada ${caPasses}: +${result.summary.created} nuevos / +${result.summary.updated} act.` +
          ` · keywords ${offset}/${terms}` +
          ` · listado ${listingFail ? "FALLÓ" : "ok"}` +
          ` · ciclo keywords=${keywordsWrapped}`
      );

      if (consecutiveListingFails >= 4 && !listingOk) {
        console.log("Listado MP sigue sin responder; continúo keywords y paso a licitaciones si el ciclo ya dio una vuelta.");
        if (keywordsWrapped) break;
      }
    } else {
      console.log(`CA pasada ${caPasses}: cola reiniciada (keywords 0/${terms || 81}), ahora consulta MP…`);
    }
  }

  let licPasses = 0;
  let licDone = false;
  const licPending = await loadPending("licitacion");
  const skipLic = process.env.SYNC_SKIP_LIC !== "0" && !licPending;
  if (skipLic) {
    licDone = true;
    console.log("Licitaciones: sin cola pendiente, se omite esta pasada.");
  }
  let licContinue = Boolean(licPending);
  while (!skipLic && hasTime() && licPasses < 12 && !licDone) {
    licPasses += 1;
    const result = await runDashboardSyncBatch({
      continueBatch: licContinue,
      scope: "licitacion",
      cron: false,
      serverSide: true,
      maxBatchMs: 90_000,
    });
    licContinue = true;
    created += result.summary.created;
    updated += result.summary.updated;
    fetched = Math.max(fetched, result.summary.fetched);
    errors.push(...(result.summary.errors ?? []));
    licDone = Boolean(result.done);
    console.log(
      `LIC pasada ${licPasses}: +${result.summary.created} nuevos / +${result.summary.updated} act.` +
        ` · done=${licDone}`
    );
  }

  const caAfter = await countCa();
  const supabase = createServiceClient();
  const caPending = await loadPending("compra_agil");
  const mpError =
    caPending?.errors?.find((e) => /chilecompra|timeout|504|503|502|no respondió/i.test(e)) ?? null;

  const nowIso = new Date().toISOString();
  await supabase
    .from("org_settings")
    .update({
      ...(created + updated > 0
        ? {
            last_mp_sync_at: nowIso,
            last_mp_sync_ca_at: nowIso,
            last_mp_sync_ca_cron_at: nowIso,
            last_mp_sync_ca_manual_at: nowIso,
          }
        : {}),
      last_cron_summary: {
        partial: !(keywordsWrapped && listingOk && licDone),
        fetched,
        created,
        updated,
        archived: 0,
        cronCaPasses: caPasses,
        mpError: listingOk ? null : (mpError?.slice(0, 200) ?? null),
        at: nowIso,
        source: "local_nightly",
      },
      last_cron_error: listingOk ? null : (mpError?.slice(0, 500) ?? null),
      updated_at: nowIso,
    })
    .eq("organization_id", DEFAULT_ORG_ID);

  if (!listingOk && mpError) {
    await recordCronFailure(mpError).catch(() => undefined);
  }

  console.log("———");
  console.log(`CA en dashboard: ${caBefore} → ${caAfter}`);
  console.log(`Totales: ${created} nuevos · ${updated} actualizados`);
  console.log(`Keywords ciclo completo: ${keywordsWrapped ? "sí" : "no"} · listado MP: ${listingOk ? "ok" : "falló"} · licitaciones: ${licDone ? "listo" : "pendiente"}`);
  logPending("Cola CA final", caPending);
  logPending("Cola LIC final", await loadPending("licitacion"));
  if (errors.length) {
    console.log("Avisos:");
    for (const err of [...new Set(errors)].slice(0, 12)) console.log(`  - ${err}`);
  }
  } finally {
    clearInterval(heartbeat);
  }
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Sync abortada:", message);
  await recordCronFailure(message).catch(() => undefined);
  process.exit(1);
});
