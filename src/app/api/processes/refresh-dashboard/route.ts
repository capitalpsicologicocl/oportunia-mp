import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { refreshDashboardProcesses } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { ids?: string[] };
    if (!body.ids?.length) {
      return NextResponse.json({ error: "Indica ids de procesos del dashboard" }, { status: 400 });
    }

    const result = await refreshDashboardProcesses(body.ids);
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
