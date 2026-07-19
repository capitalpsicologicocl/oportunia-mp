"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import { CRM_BADGE_CLASS } from "@/lib/dashboard/crm-styles";
import type { KanbanColumna } from "@/types/database";
import { cn } from "@/lib/utils";

export function ProcessCrmCell({
  processId,
  codigoExterno,
  enCrm,
  crmColumna,
}: {
  processId: string;
  codigoExterno: string;
  enCrm: boolean;
  crmColumna: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function sendToPreevaluacion() {
    setLoading(true);
    try {
      const res = await fetch("/api/kanban/preevaluar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ process_id: processId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; cardId?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Error HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      alert(`No se pudo enviar a Pre-evaluación.\n\n${msg}`);
    } finally {
      setLoading(false);
    }
  }

  if (enCrm) {
    const col = (crmColumna ?? "preevaluacion") as KanbanColumna;
    const label = KANBAN_COLUMN_LABELS[col] ?? "Pre-evaluación";
    const style = CRM_BADGE_CLASS[col] ?? CRM_BADGE_CLASS.preevaluacion;
    const kanbanHref = `/kanban?q=${encodeURIComponent(codigoExterno)}`;

    return (
      <div className="flex w-full min-w-[4.75rem] flex-col items-stretch gap-0.5">
        <span
          className={cn(
            "inline-flex min-h-7 w-full items-center justify-center rounded border px-0.5 text-center text-[8px] leading-tight",
            style
          )}
        >
          {label}
        </span>
        <Link href={kanbanHref} className="text-center text-[8px] leading-none text-[#d4a017] hover:underline">
          Ver Kanban
        </Link>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="brandOutline"
      className="h-7 w-full px-0.5 text-[9px] font-semibold"
      disabled={loading}
      onClick={sendToPreevaluacion}
    >
      {loading ? "…" : "Pre-Eval."}
    </Button>
  );
}
