"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RefreshFromMpButton({ codigo }: { codigo?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    try {
      const body = codigo?.trim() ? { codigo: codigo.trim() } : { batch: true, limit: 50 };
      const res = await fetch("/api/processes/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: string;
        refreshed?: number;
        notFound?: number;
        errors?: string[];
      };

      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "No se pudo actualizar");
        return;
      }

      if (data.result === "updated") {
        setMessage("Proceso actualizado desde Mercado Público.");
      } else if (data.result === "not_found") {
        setMessage("No se encontró el proceso en la API.");
      } else if (typeof data.refreshed === "number") {
        setMessage(
          `Actualizados ${data.refreshed} proceso${data.refreshed !== 1 ? "s" : ""} desde MP.`
        );
      }

      router.refresh();
    } catch {
      setMessage("Error de conexión al actualizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleRefresh}>
        {loading
          ? "Actualizando…"
          : codigo?.trim()
            ? "Actualizar este proceso"
            : "Actualizar adjudicaciones"}
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}
