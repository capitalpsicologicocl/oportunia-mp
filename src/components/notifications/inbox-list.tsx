"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFechaCL } from "@/lib/dashboard/format";
import type { NotificationRow } from "@/lib/notifications/queries";

function tipoBadge(tipo: string) {
  switch (tipo) {
    case "adjudicacion_propia":
      return <Badge className="bg-emerald-600 text-white">Adjudicación</Badge>;
    case "estado_cambio":
      return <Badge variant="secondary">Estado</Badge>;
    case "api_key_error":
      return <Badge variant="destructive">API key</Badge>;
    case "ingesta_error":
      return <Badge variant="destructive">Ingesta</Badge>;
    default:
      return <Badge variant="outline">{tipo}</Badge>;
  }
}

export function InboxList({
  initialNotifications,
  initialUnread,
}: {
  initialNotifications: NotificationRow[];
  initialUnread: number;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.leida) : notifications;

  async function markRead(id: string) {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
      );
      setUnread((c) => Math.max(0, c - 1));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })));
      setUnread(0);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            Todas ({notifications.length})
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
          >
            No leídas ({unread})
          </Button>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead} disabled={loading}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {filter === "unread"
              ? "No tienes notificaciones sin leer."
              : "Aún no hay notificaciones. Se crearán cuando cambie el estado de un proceso o te adjudiquen una licitación."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <li key={n.id}>
              <Card className={n.leida ? "opacity-80" : "border-primary/30 bg-primary/5"}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {tipoBadge(n.tipo)}
                        {!n.leida && (
                          <span className="text-xs font-medium text-primary">Nueva</span>
                        )}
                      </div>
                      <CardTitle className="text-base">{n.titulo}</CardTitle>
                      <CardDescription>{formatFechaCL(n.created_at)}</CardDescription>
                    </div>
                    {!n.leida && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markRead(n.id)}
                        disabled={loading}
                      >
                        Marcar leída
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">{n.mensaje}</p>
                  {n.process_codigo && (
                    <p className="text-sm text-muted-foreground">
                      Proceso:{" "}
                      {n.process_url ? (
                        <a
                          href={n.process_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {n.process_codigo}
                        </a>
                      ) : (
                        n.process_codigo
                      )}
                      {n.process_nombre ? ` — ${n.process_nombre}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
