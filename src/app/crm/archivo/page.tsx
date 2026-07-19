import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFechaCL, tipoLabel } from "@/lib/dashboard/format";
import { getArchivedKanbanCards } from "@/lib/kanban/queries";
import { formatMontoCLP } from "@/lib/montos";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export default async function CrmArchivoPage() {
  const status = await getOnboardingStatus().catch(() => null);
  if (status && !status.organization?.onboarding_completed) {
    redirect("/onboarding");
  }

  const cards = await getArchivedKanbanCards();

  return (
    <div className="min-h-full bg-background">
      <AppHeader />

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Procesos descartados del Kanban. No aparecen en el Dashboard ni en el tablero activo, pero
          quedan registrados aquí.
        </p>

        {cards.length === 0 ? (
          <div className="brand-card p-12 text-center text-muted-foreground">
            No hay procesos archivados.
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div key={card.id} className="brand-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{card.process.codigo_externo}</p>
                    <h3 className="font-semibold text-[#11233d]">{card.process.nombre}</h3>
                    <p className="text-xs text-muted-foreground">
                      {tipoLabel(card.process.tipo)} · {card.estado_interno ?? "Sin estado interno"}
                    </p>
                  </div>
                  <Badge variant="outline">Descartada</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>Monto: {formatMontoCLP(card.process.monto_estimado)}</span>
                  <span>Cierre: {formatFechaCL(card.process.fecha_cierre)}</span>
                </div>
                {card.observaciones && (
                  <p className="mt-2 text-sm text-muted-foreground">{card.observaciones}</p>
                )}
                {card.process.url_publica && (
                  <a
                    href={card.process.url_publica}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-[#d4a017] hover:underline"
                  >
                    Ver en MP →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" render={<Link href="/kanban" />}>
          Volver al Kanban
        </Button>
      </main>
    </div>
  );
}
