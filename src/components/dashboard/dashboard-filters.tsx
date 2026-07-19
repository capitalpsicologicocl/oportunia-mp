"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { KANBAN_COLUMN_LABELS, KANBAN_COLUMNS } from "@/lib/kanban/columns";
import { crmFilterLabel } from "@/lib/dashboard/crm-styles";

export function DashboardFilters({
  basePath = "/",
  showCrmFilter = true,
}: {
  basePath?: string;
  showCrmFilter?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const filtro = searchParams.get("filtro") ?? "ambos";
  const adjudicadoAMi = searchParams.get("adjudicado") === "1";
  const crm = searchParams.get("crm") ?? "all";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === "all") params.delete(key);
        else params.set(key, value);
      }
      if (!updates.page) params.delete("page");
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`);
      });
    },
    [router, searchParams, basePath]
  );

  function clearFilters() {
    startTransition(() => router.push(basePath));
  }

  return (
    <div className="space-y-4 brand-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label htmlFor="q">Buscar</Label>
          <Input
            id="q"
            defaultValue={q}
            placeholder="Nombre, código, productos…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParams({ q: (e.target as HTMLInputElement).value });
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <Label>Filtro contenido</Label>
          <Select value={filtro} onValueChange={(v) => updateParams({ filtro: v ?? "ambos" })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">Keywords + rubros</SelectItem>
              <SelectItem value="keywords">Solo keywords</SelectItem>
              <SelectItem value="rubros">Solo rubros</SelectItem>
              <SelectItem value="todos">Sin filtro contenido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showCrmFilter && (
          <div className="space-y-1">
            <Label>Estado CRM</Label>
            <Select value={crm} onValueChange={(v) => updateParams({ crm: v ?? "all" })}>
              <SelectTrigger className="w-[190px]">
                <SelectValue>{crm === "all" ? "Todos" : crmFilterLabel(crm)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sin_crm">Sin CRM</SelectItem>
                <SelectItem value="en_crm">En CRM (cualquier etapa)</SelectItem>
                {KANBAN_COLUMNS.map((col) => (
                  <SelectItem key={col} value={col}>
                    {KANBAN_COLUMN_LABELS[col]}
                  </SelectItem>
                ))}
                <SelectItem value="ejecucion_plus">Ejecución en adelante</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <Label>Vista</Label>
          <Select
            value={adjudicadoAMi ? "adjudicado" : "todos"}
            onValueChange={(v) =>
              updateParams({ adjudicado: v === "adjudicado" ? "1" : "" })
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="adjudicado">Adjudicado a ti</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="brand"
          disabled={isPending}
          onClick={() => {
            const input = document.getElementById("q") as HTMLInputElement | null;
            updateParams({ q: input?.value ?? "" });
          }}
        >
          {isPending ? "Filtrando…" : "Aplicar"}
        </Button>
        <Button variant="outline" onClick={clearFilters} disabled={isPending}>
          Limpiar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Filtro activo:{" "}
        {filtro === "ambos"
          ? "procesos que coinciden con alguna keyword O algún rubro tuyo"
          : filtro === "keywords"
            ? "solo keywords activas"
            : filtro === "rubros"
              ? "solo tus rubros de Mercado Público"
              : "todos los procesos importados"}
        {adjudicadoAMi ? " · solo adjudicados a ti" : ""}
        {showCrmFilter && crm !== "all" ? ` · CRM: ${crmFilterLabel(crm)}` : ""}
      </p>
    </div>
  );
}

export function DashboardPagination({
  basePath = "/",
  page,
  totalPages,
  total,
}: {
  basePath?: string;
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    startTransition(() => router.push(`${basePath}?${params.toString()}`));
  }

  const pages: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        {total} procesos · página {page} de {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1 || isPending} onClick={() => goToPage(page - 1)}>
          ‹
        </Button>
        {start > 1 && (
          <>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => goToPage(1)}>1</Button>
            {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? "brand" : "outline"}
            size="sm"
            disabled={isPending}
            onClick={() => goToPage(p)}
          >
            {p}
          </Button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => goToPage(totalPages)}>
              {totalPages}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" disabled={page >= totalPages || isPending} onClick={() => goToPage(page + 1)}>
          ›
        </Button>
      </div>
    </div>
  );
}
