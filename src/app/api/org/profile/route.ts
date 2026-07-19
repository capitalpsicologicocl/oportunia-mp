import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as {
    razon_social?: string;
    nombre_fantasia?: string;
    name?: string;
  };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      razon_social: body.razon_social?.trim() || null,
      nombre_fantasia: body.nombre_fantasia?.trim() || null,
      name: body.nombre_fantasia?.trim() || body.razon_social?.trim() || body.name?.trim() || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", DEFAULT_ORG_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
