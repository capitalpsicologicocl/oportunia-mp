import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runFastManualSync } from "@/lib/ingest/service";
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
    scope?: string;
    continueBatch?: boolean;
  };

  try {
    const batch = await runFastManualSync(parseScope(body.scope), {
      continueBatch: body.continueBatch === true,
    });
    return NextResponse.json({ ok: true, ...batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
