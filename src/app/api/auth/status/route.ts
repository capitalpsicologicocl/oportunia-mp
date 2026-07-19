import { NextResponse } from "next/server";
import { orgHasUsers } from "@/lib/auth/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export async function GET() {
  const session = await getSessionUser();
  const hasUsers = await orgHasUsers().catch(() => false);
  let onboardingCompleted = false;
  try {
    const status = await getOnboardingStatus();
    onboardingCompleted = Boolean(status.organization?.onboarding_completed);
  } catch {
    onboardingCompleted = false;
  }

  return NextResponse.json({
    authenticated: Boolean(session),
    hasUsers,
    needsSetup: onboardingCompleted && !hasUsers,
    user: session,
  });
}
