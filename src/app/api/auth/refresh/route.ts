import { NextResponse } from "next/server";
import { getSessionUser, setSessionCookie } from "@/lib/auth/session";

/** Renueva la sesión (60 min desde última actividad). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await setSessionCookie(user);
  return NextResponse.json({ ok: true });
}
