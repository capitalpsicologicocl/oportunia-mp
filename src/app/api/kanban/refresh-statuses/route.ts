import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { refreshKanbanPipelineProcesses } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: number };

  try {
    const summary = await refreshKanbanPipelineProcesses(body.limit ?? 30);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
