import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { enqueuePendingMpImport } from "@/lib/ingest/service";
import { looksLikeProcessCodigo } from "@/lib/dashboard/process-codigo";
import { inferProcessTipo } from "@/lib/chilecompra/client";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as { codigo?: string };
  const codigo = body.codigo?.trim() ?? "";
  if (!looksLikeProcessCodigo(codigo)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  await enqueuePendingMpImport(codigo, inferProcessTipo(codigo));
  revalidatePath("/compra-agil");
  revalidatePath("/licitaciones");
  return NextResponse.json({
    ok: true,
    result: "queued",
    codigo,
    message: "Código anotado en el dashboard. Completando ficha desde Mercado Público…",
  });
}
