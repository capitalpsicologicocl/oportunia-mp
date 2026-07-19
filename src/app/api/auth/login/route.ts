import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { parseRutInput } from "@/lib/auth/rut";
import { setSessionCookie, type SessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { rut?: string; password?: string };
    const parsed = parseRutInput(body.rut ?? "");
    if (!parsed || !body.password?.trim()) {
      return NextResponse.json({ error: "RUT y clave requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("org_users")
      .select("id, organization_id, rut, rut_dv, nombre, password_hash, role, activo")
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("rut", parsed.rut)
      .eq("rut_dv", parsed.rut_dv)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!user || !user.activo || !verifyPassword(body.password, user.password_hash)) {
      return NextResponse.json({ error: "RUT o clave incorrectos" }, { status: 401 });
    }

    const session: SessionUser = {
      userId: user.id,
      organizationId: user.organization_id,
      rut: `${user.rut}-${user.rut_dv}`,
      nombre: user.nombre,
      role: user.role as "owner" | "member",
    };

    await setSessionCookie(session);
    return NextResponse.json({ ok: true, user: session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al iniciar sesión";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
