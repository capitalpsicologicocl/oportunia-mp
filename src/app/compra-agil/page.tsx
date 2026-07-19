import { renderTipoDashboard } from "@/lib/dashboard/render-tipo-dashboard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompraAgilPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return renderTipoDashboard({
    searchParams: params,
    tipo: "compra_agil",
    basePath: "/compra-agil",
    title: "Compra Ágil",
    emptyHint:
      "Pulsa Sincronizar Compra Ágil para importar cotizaciones publicadas en las últimas 72 horas.",
  });
}
