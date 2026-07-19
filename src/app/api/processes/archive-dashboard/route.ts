import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { archiveStaleDashboardProcesses } from "@/lib/dashboard/archive-processes";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }

  try {
    const { archived } = await archiveStaleDashboardProcesses();
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");
    revalidatePath("/historial");
    return NextResponse.json({ ok: true, archived });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
