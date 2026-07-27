import { NextRequest, NextResponse } from "next/server";
import { recordCronAttempt, recordCronFailure, runDashboardSyncCron } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel Cron envía user-agent vercel-cron/1.0 y header x-vercel-cron. */
function isVercelCronRequest(request: NextRequest): boolean {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
    return false;
  }
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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "No autorizado",
        hint: "Configura CRON_SECRET en Vercel o invoca desde Cron Jobs de Vercel",
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
