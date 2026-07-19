import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getMpSyncStatusForScope } from "@/lib/dashboard/sync-status-scope";
import type { SyncScope } from "@/lib/ingest/sync-refresh";

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const scopeParam = request.nextUrl.searchParams.get("scope");
  const scope: Exclude<SyncScope, "all"> =
    scopeParam === "licitacion" ? "licitacion" : "compra_agil";

  const status = await getMpSyncStatusForScope(scope);
  return NextResponse.json(status);
}
