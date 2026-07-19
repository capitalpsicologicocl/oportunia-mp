import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { parseRutInput } from "@/lib/auth/rut";
import { setSessionCookie, type SessionUser } from "@/lib/auth/session";
import { orgHasUsers } from "@/lib/auth/db";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const hasUsers = await orgHasUsers();
    if (hasUsers) {
      return NextResponse.json({ error: "Ya existen usuarios registrados" }, { status: 400 });
    }

    const status = await getOnboardingStatus();
    if (!status.organization?.onboarding_completed) {
      return NextResponse.json({ error: "Completa el onboarding primero" }, { status: 400 });
    }

    const body = (await request.json()) as { rut?: string; password?: string; nombre?: string };
    const parsed = parseRutInput(body.rut ?? "");
    if (!parsed || !body.password?.trim() || body.password.length < 4) {
      return NextResponse.json({ error: "RUT y clave (mín. 4) requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("org_users")
      .insert({
        organization_id: DEFAULT_ORG_ID,
        rut: parsed.rut,
        rut_dv: parsed.rut_dv,
        nombre: body.nombre?.trim() || "Administrador",
        password_hash: hashPassword(body.password),
        role: "owner",
      })
      .select("id, organization_id, rut, rut_dv, nombre, role")
      .single();

    if (error) throw new Error(error.message);

    const session: SessionUser = {
      userId: user.id,
      organizationId: user.organization_id,
      rut: `${user.rut}-${user.rut_dv}`,
      nombre: user.nombre,
      role: user.role as "owner",
    };

    await setSessionCookie(session);
    return NextResponse.json({ ok: true, user: session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
