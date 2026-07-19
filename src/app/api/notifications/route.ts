import { NextRequest, NextResponse } from "next/server";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/queries";

export async function GET(request: NextRequest) {
  try {
    const soloNoLeidas = request.nextUrl.searchParams.get("unread") === "1";
    const [notifications, unreadCount] = await Promise.all([
      getNotifications({ soloNoLeidas }),
      getUnreadCount(),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; all?: boolean };

    if (body.all) {
      const marked = await markAllNotificationsRead();
      return NextResponse.json({ ok: true, marked });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    await markNotificationRead(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
