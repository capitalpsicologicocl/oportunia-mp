import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  DashboardFilters,
  DashboardPagination,
} from "@/components/dashboard/dashboard-filters";
import { ProcessTableClient } from "@/components/dashboard/process-table-client";
import { getDashboardProcesses, type DashboardSort } from "@/lib/dashboard/get-processes";
import { getDashboardArchiveCounts } from "@/lib/dashboard/archive-processes";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import type { ProcessTipo } from "@/types/database";

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DescartadasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const orgStatus = await getOnboardingStatus().catch(() => null);
  if (orgStatus && !orgStatus.organization?.onboarding_completed) {
    redirect("/onboarding");
  }

  const tipoParam = param(params.tipo);
  const tipo: ProcessTipo | undefined =
    tipoParam === "compra_agil" || tipoParam === "licitacion" ? tipoParam : undefined;

  const filtroParam = param(params.filtro);
  const filtro =
    filtroParam === "keywords" ||
    filtroParam === "rubros" ||
    filtroParam === "todos" ||
    filtroParam === "ambos"
      ? filtroParam
      : "todos";

  const page = Math.max(1, Number(param(params.page) ?? "1") || 1);
  const searchQ = param(params.q);
  const region = param(params.region);
  const organismo = param(params.organismo);
  const sortParam = param(params.sort);
  const sort: DashboardSort =
    sortParam === "cierre_asc" ||
    sortParam === "cierre_desc" ||
    sortParam === "publicacion_asc" ||
    sortParam === "publicacion_desc" ||
    sortParam === "monto_asc" ||
    sortParam === "monto_desc"
      ? sortParam
      : "publicacion_desc";

  const [dashboard, archiveCounts] = await Promise.all([
    getDashboardProcesses({
      q: searchQ,
      tipo,
      filtro,
      region,
      organismo,
      page,
      sort,
      archived: true,
    }),
    getDashboardArchiveCounts(),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-muted-foreground">Descartadas</h1>
            <p className="text-sm text-muted-foreground">
              Oportunidades que quitaste del dashboard activo (CA y licitaciones). No se actualizan
              al sincronizar; puedes refrescarlas manualmente aquí o restaurarlas.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link
              href="/historial"
              className={`rounded-lg px-3 py-1.5 ${!tipo ? "bg-muted text-foreground" : "border text-muted-foreground"}`}
            >
              Todas
            </Link>
            <Link
              href="/historial?tipo=compra_agil"
              className={`rounded-lg px-3 py-1.5 ${tipo === "compra_agil" ? "bg-muted text-foreground" : "border text-muted-foreground"}`}
            >
              Compra Ágil
            </Link>
            <Link
              href="/historial?tipo=licitacion"
              className={`rounded-lg px-3 py-1.5 ${tipo === "licitacion" ? "bg-muted text-foreground" : "border text-muted-foreground"}`}
            >
              Licitaciones
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-muted-foreground/20 bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dashboard activo
            </p>
            <p className="font-heading text-2xl font-bold text-[#11233d]">
              {archiveCounts.active.toLocaleString("es-CL")}
            </p>
          </div>
          <div className="rounded-xl border border-muted-foreground/20 bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Descartadas
            </p>
            <p className="font-heading text-2xl font-bold text-muted-foreground">
              {archiveCounts.archived.toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
          <DashboardFilters
            basePath="/historial"
            showCrmFilter={false}
            regionOptions={dashboard.filterOptions.regiones}
            organismoOptions={dashboard.filterOptions.organismos}
          />
        </Suspense>

        <ProcessTableClient
          processes={dashboard.processes}
          sort={sort}
          basePath="/historial"
          mode="discarded"
          showTipoColumn
          showCrmColumn={false}
          emptyMessage="No hay oportunidades descartadas con estos filtros."
        />

        <DashboardPagination
          basePath="/historial"
          page={dashboard.page}
          totalPages={dashboard.totalPages}
          total={dashboard.total}
        />
      </main>
    </div>
  );
}
