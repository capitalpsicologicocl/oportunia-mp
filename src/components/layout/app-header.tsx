import Image from "next/image";
import Link from "next/link";
import { SessionActivity } from "@/components/auth/session-activity";
import { AppNav } from "@/components/layout/app-nav";
import { getSessionUser } from "@/lib/auth/session";
import { getUnreadCount } from "@/lib/notifications/queries";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export async function AppHeader() {
  let unreadCount = 0;
  let fantasyName: string | undefined;
  let userName: string | undefined;

  try {
    const session = await getSessionUser();
    unreadCount = await getUnreadCount(session);
    const status = await getOnboardingStatus();
    fantasyName =
      status.organization?.nombre_fantasia?.trim() ||
      status.organization?.name?.trim() ||
      undefined;
    userName = session?.nombre;
  } catch {
    unreadCount = 0;
  }

  return (
    <>
      <SessionActivity />
      <header className="brand-header sticky top-0 z-20 shadow-lg">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <Image
            src="/oportunia-logo.png"
            alt="OportunIA"
            width={168}
            height={52}
            className="h-10 w-auto sm:h-11"
            priority
          />
          <div className="hidden border-l border-white/25 pl-3 md:block">
            <p className="text-[11px] uppercase tracking-wider text-[#d4a017]">OportunIA MP</p>
            <h1 className="font-heading text-base font-semibold text-white">
              {fantasyName ?? "Mi empresa"}
            </h1>
          </div>
        </Link>
        <AppNav unreadCount={unreadCount} userName={userName} />
      </div>
    </header>
    </>
  );
}

export async function getOrgTitle(): Promise<string> {
  try {
    const status = await getOnboardingStatus();
    return (
      status.organization?.nombre_fantasia?.trim() ||
      status.organization?.name?.trim() ||
      "Dashboard"
    );
  } catch {
    return "Dashboard";
  }
}
