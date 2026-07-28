import { NextRequest, NextResponse } from "next/server";
import { recordCronAttempt, recordCronFailure, runDashboardSyncCron } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Señales que Vercel envía al invocar Cron Jobs (varían según versión/plan). */
function isVercelCronRequest(request: NextRequest): boolean {
  if (process.env.VERCEL !== "1") return false;

  if (request.headers.has("x-vercel-cron-auth-token")) return true;
  if (request.headers.has("x-vercel-cron-schedule")) return true;

  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("vercel-cron")) return true;

  return request.headers.has("x-vercel-cron");
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) return true;
    if (request.headers.get("x-cron-secret") === cronSecret) return true;
  }

  return isVercelCronRequest(request);
}

async function handleCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "No autorizado",
        hint: "Invoca desde Cron Jobs de Vercel o con Authorization: Bearer CRON_SECRET",
      },
      { status: 401 }
    );
  }

  await recordCronAttempt().catch(() => undefined);

  try {
    const summary = await runDashboardSyncCron({ maxMs: 275_000 });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await recordCronFailure(message).catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
