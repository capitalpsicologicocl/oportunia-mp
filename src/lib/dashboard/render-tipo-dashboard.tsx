import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import {
  DashboardFilters,
  DashboardPagination,
} from "@/components/dashboard/dashboard-filters";
import { DashboardStats } from "@/components/dashboard/process-table";
import { ProcessTableClient } from "@/components/dashboard/process-table-client";
import { SyncMercadoPublicoButton } from "@/components/dashboard/sync-mp-button";
import { getDashboardProcesses, type DashboardSort } from "@/lib/dashboard/get-processes";
import { getMpSyncStatusForScope } from "@/lib/dashboard/sync-status-scope";
import { maybeRefreshSearchProcess } from "@/lib/ingest/service";
import { deleteEstadoCambioNotifications } from "@/lib/notifications/create";
import { getSessionUser } from "@/lib/auth/session";
import { getUnreadCount } from "@/lib/notifications/queries";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import type { DashboardCrmFilter } from "@/lib/dashboard/get-processes";
import type { ProcessTipo } from "@/types/database";

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function renderTipoDashboard({
  searchParams,
  tipo,
  basePath,
  title,
  emptyHint,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  tipo: ProcessTipo;
  basePath: string;
  title: string;
  emptyHint: string;
}) {
  let orgStatus;
  try {
    orgStatus = await getOnboardingStatus();
  } catch {
    orgStatus = null;
  }

  if (orgStatus && !orgStatus.organization?.onboarding_completed) {
    redirect("/onboarding");
  }

  const filtroParam = param(searchParams.filtro);
  const filtro =
    filtroParam === "keywords" ||
    filtroParam === "rubros" ||
    filtroParam === "todos" ||
    filtroParam === "ambos"
      ? filtroParam
      : "ambos";

  const page = Math.max(1, Number(param(searchParams.page) ?? "1") || 1);
  const adjudicadoAMi = param(searchParams.adjudicado) === "1";
  const searchQ = param(searchParams.q);
  const sortParam = param(searchParams.sort);
  const sort: DashboardSort =
    sortParam === "cierre_asc" ||
    sortParam === "cierre_desc" ||
    sortParam === "publicacion_asc" ||
    sortParam === "publicacion_desc" ||
    sortParam === "monto_asc" ||
    sortParam === "monto_desc"
      ? sortParam
      : "publicacion_desc";

  const crmParam = param(searchParams.crm);
  const crm: DashboardCrmFilter =
    crmParam === "sin_crm" ||
    crmParam === "en_crm" ||
    crmParam === "ejecucion_plus" ||
    crmParam === "preevaluacion" ||
    crmParam === "preparacion_pt" ||
    crmParam === "postulada" ||
    crmParam === "ejecucion" ||
    crmParam === "cierre" ||
    crmParam === "pagada"
      ? crmParam
      : "all";

  await maybeRefreshSearchProcess(searchQ);
  await deleteEstadoCambioNotifications().catch(() => undefined);

  const scope = tipo === "compra_agil" ? "compra_agil" : "licitacion";
  const session = await getSessionUser();

  const [dashboard, unreadCount, syncStatus] = await Promise.all([
    getDashboardProcesses({
      q: searchQ,
      tipo,
      estado: param(searchParams.estado),
      filtro,
      adjudicadoAMi,
      crm: crm === "all" ? undefined : crm,
      page,
      sort,
    }),
    getUnreadCount(session),
    getMpSyncStatusForScope(scope),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold text-[#11233d]">{title}</h1>
        </div>

        {unreadCount > 0 && (
          <Link
            href="/bandeja"
            className="block rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm hover:bg-primary/10"
          >
            Tienes <strong>{unreadCount}</strong> notificación
            {unreadCount !== 1 ? "es" : ""} sin leer.{" "}
            <span className="font-medium text-primary">Ver bandeja →</span>
          </Link>
        )}

        <DashboardStats
          totalEnBase={dashboard.stats.totalEnBase}
          matching={dashboard.stats.matchingFiltro}
          keywordsCount={dashboard.keywords.length}
          rubrosCount={dashboard.rubros.length}
        />

        <SyncMercadoPublicoButton
          scope={scope}
          isFirstSync={syncStatus.isFirstSync}
          lastSyncLabel={syncStatus.lastSyncLabel}
        />

        {syncStatus.hasSyncedData && (
          <>
            <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
              <DashboardFilters basePath={basePath} />
            </Suspense>

            <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
              <ProcessTableClient
                processes={dashboard.processes}
                sort={sort}
                basePath={basePath}
                showTipoColumn={false}
              />
            </Suspense>

            <DashboardPagination
              basePath={basePath}
              page={dashboard.page}
              totalPages={dashboard.totalPages}
              total={dashboard.total}
            />
          </>
        )}

        {!syncStatus.hasSyncedData && (
          <div className="brand-card space-y-3 p-12 text-center">
            <p className="text-lg font-semibold text-[#11233d]">Sin datos aún</p>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">{emptyHint}</p>
          </div>
        )}
      </main>
    </div>
  );
}
