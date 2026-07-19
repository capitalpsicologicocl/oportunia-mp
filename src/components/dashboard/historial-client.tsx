"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MpEstadoBadge } from "@/lib/dashboard/mp-estado-badge";
import { formatFechaCL, tipoLabel } from "@/lib/dashboard/format";
import type { ProcessRow } from "@/lib/dashboard/get-processes";
import { formatMontoCLP } from "@/lib/montos";

export function HistorialArchiveButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function archiveNow() {
    if (
      !confirm(
        "¿Archivar procesos terminales y cerrados hace más de 30 días?\n\nNo se archivan procesos en Kanban ni adjudicados a tu empresa."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/processes/archive-dashboard", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; archived?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      alert(`${data.archived ?? 0} proceso(s) movidos al historial.`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo archivar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="brandOutline" size="sm" disabled={loading} onClick={archiveNow}>
      {loading ? "Archivando…" : "Archivar ahora"}
    </Button>
  );
}

export function HistorialRestoreButton({ processId }: { processId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    setLoading(true);
    try {
      const res = await fetch("/api/processes/restore-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [processId] }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo restaurar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={loading} onClick={restore}>
      {loading ? "…" : "Restaurar"}
    </Button>
  );
}

export function HistorialTable({ processes }: { processes: ProcessRow[] }) {
  if (processes.length === 0) {
    return (
      <div className="brand-card space-y-3 p-12 text-center text-muted-foreground">
        <p>No hay procesos en el historial con estos filtros.</p>
        <p className="text-xs">
          Usa <strong>Archivar ahora</strong> para mover terminales y cerradas antiguas fuera del dashboard activo.
        </p>
      </div>
    );
  }

  return (
    <div className="brand-card divide-y text-sm">
      {processes.map((p) => (
        <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">{p.codigo_externo}</p>
            <p className="font-medium text-[#11233d]">{p.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {tipoLabel(p.tipo)} · {formatMontoCLP(p.monto_estimado)} · Cierre{" "}
              {formatFechaCL(p.fecha_cierre)}
              {p.dashboard_archived_at && (
                <> · Archivado {formatFechaCL(p.dashboard_archived_at)}</>
              )}
            </p>
            <div className="mt-1">
              <MpEstadoBadge
                estado={p.estado}
                adjudicadoAMi={p.adjudicado_a_mi}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {p.url_publica && (
              <a
                href={p.url_publica}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#d4a017] hover:underline"
              >
                MP
              </a>
            )}
            <HistorialRestoreButton processId={p.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
