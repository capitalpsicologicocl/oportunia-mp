import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runDashboardSyncBatch } from "@/lib/ingest/service";
import type { SyncScope } from "@/lib/ingest/sync-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseScope(value: unknown): Exclude<SyncScope, "all"> {
  if (value === "licitacion") return "licitacion";
  return "compra_agil";
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Inicia sesión para sincronizar" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    continue?: boolean;
    scope?: string;
  };

  try {
    const batch = await runDashboardSyncBatch({
      continueBatch: body.continue === true,
      scope: parseScope(body.scope),
    });
    return NextResponse.json({ ok: true, ...batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
