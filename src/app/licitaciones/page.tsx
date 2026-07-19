import { renderTipoDashboard } from "@/lib/dashboard/render-tipo-dashboard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LicitacionesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return renderTipoDashboard({
    searchParams: params,
    tipo: "licitacion",
    basePath: "/licitaciones",
    title: "Licitaciones",
    emptyHint:
      "Pulsa Sincronizar Licitaciones para importar licitaciones publicadas en las últimas 72 horas.",
  });
}
