"use client";

import { mpEstadoDisplayLabel } from "@/lib/ingest/sync-refresh";
import { effectiveMpEstadoDisplay } from "@/lib/dashboard/cierre-display";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MpEstadoBadge({
  estado,
  adjudicadoAMi,
  adjudicadoRut,
  fechaCierre,
  horaCierre,
  className,
}: {
  estado: string | null;
  adjudicadoAMi: boolean;
  adjudicadoRut?: string | null;
  fechaCierre?: string | null;
  horaCierre?: string | null;
  className?: string;
}) {
  const { label, tone } =
    fechaCierre !== undefined || horaCierre !== undefined
      ? effectiveMpEstadoDisplay(estado, adjudicadoAMi, fechaCierre, horaCierre, adjudicadoRut)
      : mpEstadoDisplayLabel(estado, adjudicadoAMi, adjudicadoRut);

  return (
    <Badge
      className={cn(
        "text-[10px] font-medium",
        tone === "won" && "bg-emerald-600 text-white hover:bg-emerald-600",
        tone === "selected" && "border-blue-500/40 bg-blue-50 text-blue-900 hover:bg-blue-50",
        tone === "lost" && "bg-gray-500 text-white hover:bg-gray-500",
        tone === "open" && "border-emerald-600/40 bg-emerald-50 text-emerald-800",
        tone === "closed" && "border-amber-600/40 bg-amber-50 text-amber-900",
        tone === "neutral" && "border-muted-foreground/30 bg-muted text-muted-foreground",
        className
      )}
    >
      {label}
    </Badge>
  );
}
