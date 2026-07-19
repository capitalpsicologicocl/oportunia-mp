import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { orgHasUsers } from "@/lib/auth/db";
import { hasValidSessionCookie } from "@/lib/auth/session-edge";
import { getOnboardingStatus } from "@/lib/onboarding/status";

const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/auth/setup",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.next();
  }

  if (
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  const hasUsers = await orgHasUsers().catch(() => false);

  if (!hasUsers) {
    if (
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/api/onboarding") ||
      pathname.startsWith("/api/rubros")
    ) {
      return NextResponse.next();
    }

    let onboardingCompleted = false;
    try {
      const status = await getOnboardingStatus();
      onboardingCompleted = Boolean(status.organization?.onboarding_completed);
    } catch {
      onboardingCompleted = false;
    }

    if (!onboardingCompleted) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get("oportunia_session")?.value;
  if (!hasValidSessionCookie(token)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
