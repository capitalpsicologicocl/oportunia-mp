import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export type ProcesoEstadoRevision = "no_revisada" | "revisada" | "descartada";

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as {
    ids?: string[];
    estado?: ProcesoEstadoRevision;
  };

  if (!body.ids?.length || !body.estado) {
    return NextResponse.json({ error: "ids y estado requeridos" }, { status: 400 });
  }

  if (!["no_revisada", "revisada", "descartada"].includes(body.estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("processes")
    .update({ estado_revision: body.estado, updated_at: new Date().toISOString() })
    .eq("organization_id", DEFAULT_ORG_ID)
    .in("id", body.ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: body.ids.length });
}
