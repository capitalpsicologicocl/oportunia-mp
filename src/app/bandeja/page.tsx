import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { InboxList } from "@/components/notifications/inbox-list";
import { dedupeNotifications, deleteEstadoCambioNotifications } from "@/lib/notifications/create";
import { countAdjudicadosAMi, getNotifications, getUnreadCount } from "@/lib/notifications/queries";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export default async function BandejaPage() {
  const status = await getOnboardingStatus().catch(() => null);
  if (status && !status.organization?.onboarding_completed) {
    redirect("/onboarding");
  }

  await dedupeNotifications().catch(() => undefined);
  await deleteEstadoCambioNotifications().catch(() => undefined);

  const [notifications, unreadCount, adjudicadosCount] = await Promise.all([
    getNotifications(),
    getUnreadCount(),
    countAdjudicadosAMi(),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {adjudicadosCount > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Tienes <strong>{adjudicadosCount}</strong> proceso
            {adjudicadosCount !== 1 ? "s" : ""} marcado
            {adjudicadosCount !== 1 ? "s" : ""} como <strong>Adjudicado a ti</strong> en el
            dashboard.
          </div>
        )}

        <InboxList initialNotifications={notifications} initialUnread={unreadCount} />
      </main>
    </div>
  );
}
