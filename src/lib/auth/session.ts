import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export { orgHasUsers } from "@/lib/auth/db";

const COOKIE_NAME = "oportunia_session";
/** Sesión máxima 60 min desde emisión / última renovación. */
export const SESSION_MAX_AGE_SEC = 60 * 60;
const MAX_AGE_SEC = SESSION_MAX_AGE_SEC;

export interface SessionUser {
  userId: string;
  organizationId: string;
  rut: string;
  nombre: string;
  role: "owner" | "member";
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Falta SESSION_SECRET o SUPABASE_SERVICE_ROLE_KEY");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + MAX_AGE_SEC * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & {
      exp: number;
    };
    if (!data.userId || Date.now() > data.exp) return null;
    return {
      userId: data.userId,
      organizationId: data.organizationId,
      rut: data.rut,
      nombre: data.nombre,
      role: data.role,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return parseSessionToken(token);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
