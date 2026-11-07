import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { importProcessByCodigo } from "@/lib/ingest/service";
import { looksLikeProcessCodigo } from "@/lib/dashboard/process-codigo";

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
    return NextResponse.json(
      { error: "Código inválido. Usa el formato 1234-56-COT26." },
      { status: 400 }
    );
  }

  try {
    const result = await importProcessByCodigo(codigo, { force: true, queueIfMissing: true });
    revalidatePath("/compra-agil");
    revalidatePath("/licitaciones");

    const message =
      result === "updated"
        ? "Importada desde Mercado Público."
        : result === "queued"
          ? "Mercado Público no respondió ahora. Quedó en el dashboard y el cron la completará solo."
          : "No se encontró en Mercado Público.";

    return NextResponse.json({ ok: true, result, message, codigo });
  } catch (error) {
    await importProcessByCodigo(codigo, { force: true, queueIfMissing: true }).catch(
      () => undefined
    );
    const errMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({
      ok: true,
      result: "queued",
      message: "Mercado Público falló. El código queda en reintento automático.",
      error: errMessage,
      codigo,
    });
  }
}
