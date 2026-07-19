import { NextRequest, NextResponse } from "next/server";
import { createKanbanCardForProcess, getKanbanBoard } from "@/lib/kanban/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const board = await getKanbanBoard({ q });
    return NextResponse.json({ ok: true, ...board });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { codigo_externo?: string };
    if (!body.codigo_externo?.trim()) {
      return NextResponse.json({ error: "codigo_externo requerido" }, { status: 400 });
    }

    const card = await createKanbanCardForProcess(body.codigo_externo);
    return NextResponse.json({ ok: true, card });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
