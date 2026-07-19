import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/queries";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();
    const soloNoLeidas = request.nextUrl.searchParams.get("unread") === "1";
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const tipoParam = request.nextUrl.searchParams.get("tipo");
    const tipo = tipoParam === "mencion" ? "mencion" : "all";

    const [notifications, unreadCount] = await Promise.all([
      getNotifications({
        soloNoLeidas,
        limit: Number.isFinite(limit) ? limit : undefined,
        session,
        tipo,
      }),
      getUnreadCount(session),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionUser();
    const body = (await request.json()) as { id?: string; all?: boolean };

    if (body.all) {
      const marked = await markAllNotificationsRead(session);
      return NextResponse.json({ ok: true, marked });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    await markNotificationRead(body.id, session);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = message === "No autorizado" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
