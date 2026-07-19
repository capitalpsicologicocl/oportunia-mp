import { NextResponse } from "next/server";
import { syncAdjudicadosAMi } from "@/lib/notifications/sync-adjudicados";

export async function POST() {
  try {
    const result = await syncAdjudicadosAMi();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
