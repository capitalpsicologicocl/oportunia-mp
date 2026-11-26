import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { triggerCompraAgilGithubSync } from "@/lib/github/trigger-ca-sync";
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
  const scope = parseScope(body.scope);

  if (scope === "compra_agil") {
    try {
      const dispatched = await triggerCompraAgilGithubSync();
      return NextResponse.json({
        ok: true,
        remote: true,
        done: true,
        queued: dispatched.queued,
        alreadyRunning: dispatched.alreadyRunning,
        phase: "compra_agil",
        summary: {
          fetched: 0,
          created: 0,
          updated: 0,
          errors: [],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      return NextResponse.json({ ok: false, error: message }, { status: 503 });
    }
  }

  try {
    const batch = await runFastManualSync(scope, {
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
        phase: "licitacion",
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
