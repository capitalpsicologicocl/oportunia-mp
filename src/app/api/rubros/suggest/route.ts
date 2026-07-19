import { NextRequest, NextResponse } from "next/server";
import { suggestRubrosFromRut } from "@/lib/chilecompra/proveedor";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const { rut } = (await request.json()) as { rut?: string };
    if (!rut?.trim()) {
      return NextResponse.json({ error: "RUT requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: settings } = await supabase
      .from("org_settings")
      .select("chilecompra_ticket")
      .eq("organization_id", DEFAULT_ORG_ID)
      .single();

    const ticket = settings?.chilecompra_ticket ?? process.env.CHILECOMPRA_TICKET;
    if (!ticket) {
      return NextResponse.json(
        { error: "Configura primero el ticket de ChileCompra (paso 2)" },
        { status: 400 }
      );
    }

    const rubros = await suggestRubrosFromRut(ticket, rut.trim());
    return NextResponse.json({ rubros });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
