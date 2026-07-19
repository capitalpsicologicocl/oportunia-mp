import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { parseRutInput } from "@/lib/auth/rut";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

const MAX_USERS = 5;

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("org_users")
    .select("id, rut, rut_dv, nombre, role, activo, created_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [], maxUsers: MAX_USERS, role: session.role });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Solo el usuario principal puede agregar usuarios" }, { status: 403 });
  }

  const body = (await request.json()) as { rut?: string; nombre?: string; password?: string };
  const parsed = parseRutInput(body.rut ?? "");
  if (!parsed || !body.password?.trim() || body.password.length < 4) {
    return NextResponse.json({ error: "RUT, nombre y clave (mín. 4) requeridos" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("org_users")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("activo", true);

  if ((count ?? 0) >= MAX_USERS) {
    return NextResponse.json({ error: `Máximo ${MAX_USERS} usuarios por empresa` }, { status: 400 });
  }

  const { error } = await supabase.from("org_users").insert({
    organization_id: DEFAULT_ORG_ID,
    rut: parsed.rut,
    rut_dv: parsed.rut_dv,
    nombre: body.nombre?.trim() || "Usuario",
    password_hash: hashPassword(body.password),
    role: "member",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ese RUT ya está registrado" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Solo el usuario principal puede blanquear claves" }, { status: 403 });
  }

  const body = (await request.json()) as { userId?: string; password?: string };
  if (!body.userId || !body.password?.trim() || body.password.length < 4) {
    return NextResponse.json({ error: "Usuario y clave nueva requeridos" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: target } = await supabase
    .from("org_users")
    .select("id, role")
    .eq("id", body.userId)
    .eq("organization_id", DEFAULT_ORG_ID)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (target.role === "owner" && target.id !== session.userId) {
    return NextResponse.json({ error: "No puedes cambiar la clave de otro owner" }, { status: 403 });
  }

  const { error } = await supabase
    .from("org_users")
    .update({
      password_hash: hashPassword(body.password),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
