import { NextRequest, NextResponse } from "next/server";
import { refreshProcessInDb, refreshStaleProcesses } from "@/lib/ingest/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { codigo?: string; batch?: boolean; limit?: number };

    if (body.codigo?.trim()) {
      const result = await refreshProcessInDb(body.codigo.trim());
      return NextResponse.json({ ok: true, result });
    }

    if (body.batch) {
      const summary = await refreshStaleProcesses(body.limit ?? 50);
      return NextResponse.json({ ok: true, ...summary });
    }

    return NextResponse.json(
      { error: "Indica codigo o batch: true" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
