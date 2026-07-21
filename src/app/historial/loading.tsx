import { AppHeader } from "@/components/layout/app-header";

export default function HistorialLoading() {
  return (
    <div className="min-h-full bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </main>
    </div>
  );
}
