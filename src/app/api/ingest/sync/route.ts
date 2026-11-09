import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runFastManualSync } from "@/lib/ingest/service";
import type { SyncScope } from "@/lib/ingest/sync-refresh";

export const runtime = "nodejs";
export const maxDuration = 10;

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
    const mpTimeout = /timeout|no respondió|504|timed out/i.test(message);
    return NextResponse.json(
      {
        ok: true,
        done: true,
        partial: true,
        phase: "compra_agil",
        summary: {
          fetched: 0,
          created: 0,
          updated: 0,
          errors: [mpTimeout ? "Mercado Público no respondió a tiempo." : message],
        },
        error: message,
      },
      { status: 200 }
    );
  }
}
