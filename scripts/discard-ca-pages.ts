/**
 * Descarta al historial las oportunidades CA de las páginas indicadas del dashboard activo.
 * Uso: tsx --env-file=.env.local scripts/discard-ca-pages.ts [desde] [hasta]
 */
import { archiveProcessesToHistorial } from "../src/lib/dashboard/archive-processes";
import { getDashboardProcesses } from "../src/lib/dashboard/get-processes";

async function main() {
  const pageFrom = Math.max(1, Number(process.argv[2] ?? "5") || 5);
  const pageTo = Math.max(pageFrom, Number(process.argv[3] ?? "28") || 28);

  const allIds: string[] = [];

  for (let page = pageFrom; page <= pageTo; page += 1) {
    const dashboard = await getDashboardProcesses({
      tipo: "compra_agil",
      filtro: "ambos",
      page,
      pageSize: 25,
      sort: "publicacion_desc",
      archived: false,
    });

    if (dashboard.processes.length === 0) {
      console.log(`Página ${page}: sin procesos (total páginas: ${dashboard.totalPages})`);
      if (page > dashboard.totalPages) break;
      continue;
    }

    allIds.push(...dashboard.processes.map((p) => p.id));
    console.log(`Página ${page}: ${dashboard.processes.length} procesos`);
  }

  const uniqueIds = [...new Set(allIds)];
  console.log(`\nTotal a descartar: ${uniqueIds.length} (páginas ${pageFrom}–${pageTo})`);

  if (uniqueIds.length === 0) {
    console.log("Nada que archivar.");
    return;
  }

  let archivedTotal = 0;
  const batchSize = 100;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const archived = await archiveProcessesToHistorial(batch);
    archivedTotal += archived;
    console.log(`Lote ${Math.floor(i / batchSize) + 1}: ${archived} archivados`);
  }

  console.log(`\nListo: ${archivedTotal} oportunidades movidas a Descartadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
