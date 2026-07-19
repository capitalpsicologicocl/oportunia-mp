import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import {
  DashboardFilters,
  DashboardPagination,
} from "@/components/dashboard/dashboard-filters";
import { HistorialArchiveButton, HistorialTable } from "@/components/dashboard/historial-client";
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

export default async function HistorialPage({ searchParams }: PageProps) {
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
      : "ambos";

  const page = Math.max(1, Number(param(params.page) ?? "1") || 1);
  const searchQ = param(params.q);
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
            <h1 className="text-xl font-semibold text-[#11233d]">Historial</h1>
            <p className="text-sm text-muted-foreground">
              Procesos archivados: adjudicadas a terceros, canceladas/desiertas y cerradas hace más
              de 30 días. Puedes restaurarlos al dashboard activo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HistorialArchiveButton />
            <div className="flex gap-2 text-sm">
            <Link
              href="/historial"
              className={`rounded-lg px-3 py-1.5 ${!tipo ? "bg-[#d4a017] text-[#11233d]" : "border"}`}
            >
              Todos
            </Link>
            <Link
              href="/historial?tipo=compra_agil"
              className={`rounded-lg px-3 py-1.5 ${tipo === "compra_agil" ? "bg-[#d4a017] text-[#11233d]" : "border"}`}
            >
              Compra Ágil
            </Link>
            <Link
              href="/historial?tipo=licitacion"
              className={`rounded-lg px-3 py-1.5 ${tipo === "licitacion" ? "bg-[#d4a017] text-[#11233d]" : "border"}`}
            >
              Licitaciones
            </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="brand-stat">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dashboard activo
            </p>
            <p className="font-heading text-2xl font-bold text-[#11233d]">
              {archiveCounts.active.toLocaleString("es-CL")}
            </p>
          </div>
          <div className="brand-stat">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              En historial
            </p>
            <p className="font-heading text-2xl font-bold text-[#11233d]">
              {archiveCounts.archived.toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        <DashboardFilters basePath="/historial" showCrmFilter={false} />

        <HistorialTable processes={dashboard.processes} />

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
