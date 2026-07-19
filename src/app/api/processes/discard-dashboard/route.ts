import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { archiveProcessesToHistorial } from "@/lib/dashboard/archive-processes";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { ids?: string[] };
    if (!body.ids?.length) {
      return NextResponse.json({ error: "ids requerido" }, { status: 400 });
    }

    const archived = await archiveProcessesToHistorial(body.ids);
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");
    revalidatePath("/historial");

    return NextResponse.json({ ok: true, archived });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
