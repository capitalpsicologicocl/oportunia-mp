import { AppHeader } from "@/components/layout/app-header";

export default function KanbanLoading() {
  return (
    <div className="min-h-full bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6">
        <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-muted" />
        <div className="h-[70vh] animate-pulse rounded-xl bg-muted" />
      </main>
    </div>
  );
}
