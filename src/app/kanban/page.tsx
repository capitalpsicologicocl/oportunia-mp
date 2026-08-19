import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { getKanbanBoard } from "@/lib/kanban/queries";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

interface KanbanPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function KanbanPage({ searchParams }: KanbanPageProps) {
  const params = await searchParams;
  const status = await getOnboardingStatus().catch(() => null);

  if (status && !status.organization?.onboarding_completed) {
    redirect("/onboarding");
  }

  const q = param(params.q);
  const initialCardId = param(params.card);
  const board = await getKanbanBoard({ q });

  return (
    <div className="min-h-full bg-background">
      <AppHeader />

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Solo aparecen procesos enviados a <strong>Pre-Evaluación</strong> desde el Dashboard. Arrastra
          entre columnas; usa el ícono ⋮⋮ para mover. Las no adjudicadas pueden descartarse al Archivo CRM.
        </p>
        <KanbanBoard initialData={board} initialQ={q} initialCardId={initialCardId} />
      </main>
    </div>
  );
}
