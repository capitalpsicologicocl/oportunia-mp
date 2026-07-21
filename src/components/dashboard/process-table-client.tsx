"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProcessCrmCell } from "@/components/dashboard/process-crm-cell";
import { HoverTooltip } from "@/components/ui/hover-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatFechaCL,
  formatHora,
  tipoLabel,
} from "@/lib/dashboard/format";
import type {
  DashboardSort,
  ProcesoEstadoRevision,
  ProcessRow,
} from "@/lib/dashboard/get-processes";
import { formatOrganismoSubtitle } from "@/lib/dashboard/ubicacion-display";
import { MpEstadoBadge } from "@/lib/dashboard/mp-estado-badge";
import { formatMontoCLP } from "@/lib/montos";
import { CRM_ROW_CLASS } from "@/lib/dashboard/crm-styles";
import type { KanbanColumna } from "@/types/database";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

function SortHeader({
  label,
  field,
  current,
  onSort,
  className,
}: {
  label: string;
  field: DashboardSort;
  current: DashboardSort;
  onSort: (s: DashboardSort) => void;
  className?: string;
}) {
  const base = field.replace(/_(asc|desc)$/, "");
  const currentBase = current.replace(/_(asc|desc)$/, "");
  const active = currentBase === base;
  const asc = `${base}_asc` as DashboardSort;
  const desc = `${base}_desc` as DashboardSort;

  return (
    <button
      type="button"
      onClick={() => onSort(active && current.endsWith("_asc") ? desc : asc)}
      className={cn(
        "inline-flex w-full items-center justify-center gap-0.5 text-[10px] font-semibold text-[#11233d] hover:text-[#d4a017]",
        className
      )}
    >
      {label}
      {!active ? (
        <ArrowUpDown className="size-3 opacity-40" />
      ) : current.endsWith("_asc") ? (
        <ArrowUp className="size-3 text-[#d4a017]" />
      ) : (
        <ArrowDown className="size-3 text-[#d4a017]" />
      )}
    </button>
  );
}

function rowTextClass(revision: ProcesoEstadoRevision, enCrm: boolean): string {
  if (revision === "descartada") return "font-normal text-muted-foreground/45";
  if (enCrm || revision === "revisada") return "font-normal text-muted-foreground";
  return "font-bold text-foreground";
}

export function ProcessTableClient({
  processes,
  sort,
  basePath = "/",
  emptyMessage,
  showTipoColumn = true,
  mode = "active",
  showCrmColumn,
}: {
  processes: ProcessRow[];
  sort: DashboardSort;
  basePath?: string;
  emptyMessage?: string;
  showTipoColumn?: boolean;
  mode?: "active" | "discarded";
  showCrmColumn?: boolean;
}) {
  const isDiscarded = mode === "discarded";
  const showCrm = showCrmColumn ?? !isDiscarded;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revisionMap, setRevisionMap] = useState<Record<string, ProcesoEstadoRevision>>({});
  const [updating, setUpdating] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const pageIds = useMemo(() => processes.map((p) => p.id), [processes]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function getRevision(p: ProcessRow): ProcesoEstadoRevision {
    return revisionMap[p.id] ?? p.estado_revision ?? "no_revisada";
  }

  function applySort(next: DashboardSort) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", next);
    params.delete("page");
    startTransition(() => router.push(`${basePath}?${params.toString()}`));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(pageIds) : new Set());
  }

  async function applyRevision(estado: ProcesoEstadoRevision) {
    const ids = Array.from(selected);
    if (!ids.length) return;

    setUpdating(true);
    try {
      const res = await fetch("/api/processes/revision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, estado }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");

      setRevisionMap((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = estado;
        return next;
      });
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("No se pudo actualizar el estado de revisión.");
    } finally {
      setUpdating(false);
    }
  }

  async function markReviewed(processId: string) {
    setRowBusy(processId);
    try {
      const res = await fetch("/api/processes/revision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [processId], estado: "revisada" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      setRevisionMap((prev) => ({ ...prev, [processId]: "revisada" }));
    } catch {
      alert("No se pudo marcar como revisada.");
    } finally {
      setRowBusy(null);
    }
  }

  async function bulkDiscardSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`¿Descartar ${ids.length} oportunidad(es)? Irán a Descartadas y no se actualizarán en sync.`)) {
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch("/api/processes/discard-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("No se pudo descartar las oportunidades seleccionadas.");
    } finally {
      setUpdating(false);
    }
  }

  async function refreshDiscardedIds(ids: string[]) {
    if (!ids.length) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/processes/refresh-discarded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updated?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      if (data.errors?.length) {
        alert(`Actualizadas ${data.updated ?? 0}. Avisos: ${data.errors.slice(0, 2).join(" · ")}`);
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("No se pudo actualizar desde Mercado Público.");
    } finally {
      setUpdating(false);
    }
  }

  async function refreshDashboardIds(ids: string[]) {
    if (!ids.length) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/processes/refresh-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updated?: number;
        notFound?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      const avisos = data.errors?.filter(Boolean) ?? [];
      if (avisos.length) {
        alert(
          `Actualizadas ${data.updated ?? 0} de ${ids.length}` +
            (data.notFound ? ` · ${data.notFound} no encontradas en MP` : "") +
            `. Avisos: ${avisos.slice(0, 2).join(" · ")}`
        );
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("No se pudo actualizar estados desde Mercado Público.");
    } finally {
      setUpdating(false);
    }
  }

  async function restoreSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/processes/restore-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      setSelected(new Set());
      router.refresh();
    } catch {
      alert("No se pudo restaurar al dashboard activo.");
    } finally {
      setUpdating(false);
    }
  }

  async function restoreOne(processId: string) {
    setRowBusy(processId);
    try {
      const res = await fetch("/api/processes/restore-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [processId] }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      router.refresh();
    } catch {
      alert("No se pudo restaurar al dashboard activo.");
    } finally {
      setRowBusy(null);
    }
  }

  async function discardToHistorial(processId: string) {
    setRowBusy(processId);
    try {
      const res = await fetch("/api/processes/discard-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [processId] }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error");
      router.refresh();
    } catch {
      alert("No se pudo descartar la oportunidad.");
    } finally {
      setRowBusy(null);
    }
  }

  if (processes.length === 0) {
    return (
      <div className="brand-card p-12 text-center text-muted-foreground">
        {emptyMessage ?? "No hay procesos con estos filtros."}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${isPending ? "opacity-60" : ""}`}>
      {selected.size > 0 && (
        <div
          className={cn(
            "brand-card flex flex-wrap items-center gap-2 px-3 py-2",
            isDiscarded && "border-muted-foreground/20 bg-muted/40"
          )}
        >
          <span className="text-xs text-muted-foreground">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          {isDiscarded ? (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={() => refreshDiscardedIds(Array.from(selected))}
              >
                Actualizar seleccionadas
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={() => refreshDiscardedIds(pageIds)}
              >
                Actualizar todas (página)
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={restoreSelected}
              >
                Restaurar al dashboard
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={() => refreshDashboardIds(Array.from(selected))}
              >
                Actualizar estados
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={() => applyRevision("revisada")}
              >
                Revisada
              </Button>
              <Button
                type="button"
                size="xs"
                variant="destructive"
                disabled={updating}
                onClick={bulkDiscardSelected}
              >
                Descartar
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={updating}
                onClick={() => applyRevision("no_revisada")}
              >
                No revisada
              </Button>
            </>
          )}
        </div>
      )}

      {!isDiscarded && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#11233d]/10 bg-[#11233d]/[0.03] px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Consulta MP por código para actualizar estado, montos y fechas de esta página (sin límite de sync).
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => refreshDashboardIds(pageIds)}
          >
            {updating ? "Actualizando…" : "Actualizar estados (página)"}
          </Button>
        </div>
      )}

      {isDiscarded && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Las descartadas no se actualizan al sincronizar CA/Licitaciones. Usa actualización manual aquí.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => refreshDiscardedIds(pageIds)}
          >
            {updating ? "Actualizando…" : "Actualizar todas (página)"}
          </Button>
        </div>
      )}

      <div className={cn("brand-card", isDiscarded && "border-muted-foreground/25 bg-muted/20")}>
        <Table className="table-fixed text-[11px]">
          <TableHeader>
            <TableRow className={cn("bg-[#11233d]/5 hover:bg-[#11233d]/5", isDiscarded && "bg-muted/50 hover:bg-muted/50")}>
              <TableHead className="w-[3%] px-1 text-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Seleccionar todas"
                />
              </TableHead>
              <TableHead className={`${showTipoColumn ? "w-[10%]" : "w-[9%]"} px-2 text-center`}>Código</TableHead>
              <TableHead className={`${showTipoColumn ? "w-[22%]" : "w-[23%]"} px-2 text-center`}>Nombre</TableHead>
              {!isDiscarded && <TableHead className="w-[5%] px-1 text-center">Rev.</TableHead>}
              {isDiscarded && <TableHead className="w-[6%] px-1 text-center">Acción</TableHead>}
              {showTipoColumn && <TableHead className="w-[7%] px-2 text-center">Tipo</TableHead>}
              <TableHead className={`${showTipoColumn ? "w-[8%]" : "w-[9%]"} px-2 text-center`}>
                <SortHeader label="Monto" field="monto_asc" current={sort} onSort={applySort} />
              </TableHead>
              <TableHead className="w-[6%] px-2 text-center">
                <SortHeader label="Pub." field="publicacion_desc" current={sort} onSort={applySort} />
              </TableHead>
              <TableHead className="w-[5%] px-1 text-center">Hr. Pub.</TableHead>
              <TableHead className="w-[6%] px-2 text-center">
                <SortHeader label="Cierre" field="cierre_asc" current={sort} onSort={applySort} />
              </TableHead>
              <TableHead className="w-[5%] px-1 text-center">Hr. Cierre</TableHead>
              <TableHead className="w-[8%] px-0.5 text-center">Estado</TableHead>
              {showCrm && (
                <TableHead className={`${showTipoColumn ? "w-[8%]" : "w-[9%]"} px-1 text-center`}>CRM</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.map((p) => {
              const revision = getRevision(p);
              const textClass = rowTextClass(revision, p.en_crm);
              const crmCol = (p.crm_columna ?? "preevaluacion") as KanbanColumna;
              const crmRowClass =
                p.en_crm && !p.adjudicado_a_mi ? CRM_ROW_CLASS[crmCol] : undefined;
              const organismoSubtitle = formatOrganismoSubtitle(
                p.organismo_nombre,
                p.lugar_ejecucion
              );

              return (
                <TableRow
                  key={p.id}
                  className={cn(
                    isDiscarded && "bg-muted/30 text-muted-foreground hover:bg-muted/40",
                    !isDiscarded &&
                      (p.adjudicado_a_mi
                        ? "border-l-[3px] border-l-emerald-600 bg-emerald-50/60"
                        : crmRowClass)
                  )}
                  data-selected={selected.has(p.id) ? true : undefined}
                >
                  <TableCell className="px-1">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={(checked) => toggleOne(p.id, checked === true)}
                      aria-label={`Seleccionar ${p.codigo_externo}`}
                    />
                  </TableCell>
                  <TableCell className={`truncate px-2 font-mono text-[10px] ${textClass}`}>
                    {p.url_publica ? (
                      <a
                        href={p.url_publica}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[#d4a017] hover:underline"
                      >
                        {p.codigo_externo}
                      </a>
                    ) : (
                      p.codigo_externo
                    )}
                  </TableCell>
                  <TableCell className="px-2">
                    <HoverTooltip text={p.nombre}>
                      <p className={`line-clamp-2 cursor-help text-center text-[11px] leading-tight ${textClass}`}>
                        {p.nombre}
                      </p>
                    </HoverTooltip>
                    {organismoSubtitle && (
                      <p
                        className={`mt-0.5 line-clamp-1 text-center text-[9px] leading-tight text-muted-foreground ${revision === "descartada" ? "opacity-50" : ""}`}
                        title={organismoSubtitle}
                      >
                        {organismoSubtitle}
                      </p>
                    )}
                    {p.adjudicado_a_mi && (
                      <Badge className="mt-0.5 bg-emerald-600 px-1 py-0 text-[9px] text-white">
                        Adjud. tuyo
                      </Badge>
                    )}
                  </TableCell>
                  {isDiscarded ? (
                    <TableCell className="px-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="h-5 px-1 text-[9px]"
                        disabled={rowBusy === p.id}
                        onClick={() => restoreOne(p.id)}
                      >
                        Restaurar
                      </Button>
                    </TableCell>
                  ) : (
                    <TableCell className="px-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="h-5 min-w-[2rem] px-1 text-[9px] font-semibold"
                          disabled={rowBusy === p.id || revision === "revisada"}
                          title="Marcar como revisada"
                          onClick={() => markReviewed(p.id)}
                        >
                          REV
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="h-5 min-w-[2rem] px-1 text-[9px] font-semibold hover:border-destructive hover:text-destructive"
                          disabled={rowBusy === p.id}
                          title="Descartar"
                          onClick={() => discardToHistorial(p.id)}
                        >
                          DESC
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  {showTipoColumn && (
                    <TableCell className="truncate px-2 text-center text-[10px]">{tipoLabel(p.tipo)}</TableCell>
                  )}
                  <TableCell className="truncate px-2 text-center text-[10px] font-medium">
                    {formatMontoCLP(p.monto_estimado)}
                  </TableCell>
                  <TableCell className="truncate px-2 text-center text-[10px]">
                    {formatFechaCL(p.fecha_publicacion)}
                  </TableCell>
                  <TableCell className="truncate px-2 text-center text-[10px] text-muted-foreground">
                    {formatHora(p.hora_publicacion)}
                  </TableCell>
                  <TableCell className="truncate px-2 text-center text-[10px]">
                    {formatFechaCL(p.fecha_cierre)}
                  </TableCell>
                  <TableCell className="truncate px-2 text-center text-[10px] text-muted-foreground">
                    {formatHora(p.hora_cierre)}
                  </TableCell>
                  <TableCell className="overflow-hidden px-0.5 text-center align-middle">
                    <div className="mx-auto flex max-w-full justify-center overflow-hidden">
                      <MpEstadoBadge
                        estado={p.estado}
                        adjudicadoAMi={p.adjudicado_a_mi}
                        fechaCierre={p.fecha_cierre}
                        horaCierre={p.hora_cierre}
                        compact
                        className={isDiscarded ? "opacity-80" : undefined}
                      />
                    </div>
                  </TableCell>
                  {showCrm && (
                    <TableCell className="overflow-hidden px-1 align-middle">
                      <div className="flex justify-center overflow-hidden">
                        <ProcessCrmCell
                          processId={p.id}
                          codigoExterno={p.codigo_externo}
                          enCrm={p.en_crm}
                          crmColumna={p.crm_columna}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
