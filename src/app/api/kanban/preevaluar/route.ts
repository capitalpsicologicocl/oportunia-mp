import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sendProcessToPreevaluacion } from "@/lib/kanban/queries";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { process_id?: string };
    if (!body.process_id) {
      return NextResponse.json({ error: "process_id requerido" }, { status: 400 });
    }
    const { cardId } = await sendProcessToPreevaluacion(body.process_id);
    revalidatePath("/");
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");
    revalidatePath("/kanban");
    return NextResponse.json({ ok: true, cardId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
