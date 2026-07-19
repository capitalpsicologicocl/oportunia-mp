import { NextRequest, NextResponse } from "next/server";
import { UNSPSC_OTEC_SEED } from "@/lib/onboarding/templates";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json({ results: UNSPSC_OTEC_SEED.slice(0, 10) });
  }

  try {
    const supabase = createServiceClient();
    const { data: dbResults } = await supabase
      .from("unspsc_catalog")
      .select("codigo, nombre, categoria")
      .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`)
      .limit(20);

    if (dbResults?.length) {
      return NextResponse.json({
        results: dbResults.map((r) => ({
          codigo_unspsc: r.codigo,
          nombre: r.nombre,
          categoria: r.categoria,
        })),
      });
    }
  } catch {
    // Fallback a seed estático si la tabla aún no existe
  }

  const filtered = UNSPSC_OTEC_SEED.filter(
    (r) => r.nombre.toLowerCase().includes(q) || r.codigo.includes(q)
  ).slice(0, 20);

  return NextResponse.json({
    results: filtered.map((r) => ({ codigo_unspsc: r.codigo, nombre: r.nombre })),
  });
}
