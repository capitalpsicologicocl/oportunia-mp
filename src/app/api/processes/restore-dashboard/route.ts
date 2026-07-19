import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { restoreProcessesToDashboard } from "@/lib/dashboard/archive-processes";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: string[] };
    if (!body.ids?.length) {
      return NextResponse.json({ error: "ids requerido" }, { status: 400 });
    }

    const restored = await restoreProcessesToDashboard(body.ids);
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");
    revalidatePath("/historial");

    return NextResponse.json({ ok: true, restored });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
