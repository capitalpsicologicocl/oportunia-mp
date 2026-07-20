"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SyncScope } from "@/lib/ingest/sync-refresh";

export function SyncMercadoPublicoButton({
  scope,
  isFirstSync: isFirstSyncProp,
  lastSyncLabel: lastSyncLabelProp,
  lastManualSyncLabel: lastManualSyncLabelProp,
  lastCronSyncLabel: lastCronSyncLabelProp,
}: {
  scope: Exclude<SyncScope, "all">;
  isFirstSync?: boolean;
  lastSyncLabel?: string;
  lastManualSyncLabel?: string;
  lastCronSyncLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMeta, setSyncMeta] = useState({
    isFirstSync: true,
    lastSyncLabel: "Nunca",
    lastManualSyncLabel: "Nunca",
    lastCronSyncLabel: "Nunca",
  });

  useEffect(() => {
    if (
      isFirstSyncProp !== undefined &&
      lastSyncLabelProp !== undefined &&
      lastManualSyncLabelProp !== undefined &&
      lastCronSyncLabelProp !== undefined
    ) {
      return;
    }
    fetch(`/api/ingest/sync-status?scope=${scope}`)
      .then((res) => res.json())
      .then(
        (data: {
          isFirstSync?: boolean;
          lastSyncLabel?: string;
          lastManualSyncLabel?: string;
          lastCronSyncLabel?: string;
        }) => {
          setSyncMeta({
            isFirstSync: data.isFirstSync ?? true,
            lastSyncLabel: data.lastSyncLabel ?? "Nunca",
            lastManualSyncLabel: data.lastManualSyncLabel ?? "Nunca",
            lastCronSyncLabel: data.lastCronSyncLabel ?? "Nunca",
          });
        }
      )
      .catch(() => undefined);
  }, [
    isFirstSyncProp,
    lastSyncLabelProp,
    lastManualSyncLabelProp,
    lastCronSyncLabelProp,
    scope,
  ]);

  const isFirstSync = isFirstSyncProp ?? syncMeta.isFirstSync;
  const lastSyncLabel = lastSyncLabelProp ?? syncMeta.lastSyncLabel;
  const lastManualSyncLabel = lastManualSyncLabelProp ?? syncMeta.lastManualSyncLabel;
  const lastCronSyncLabel = lastCronSyncLabelProp ?? syncMeta.lastCronSyncLabel;

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress("Conectando con Mercado Público…");

    let continueBatch = false;
    let guard = 0;
    let networkRetries = 0;
    let aggregated = { fetched: 0, created: 0, updated: 0, archived: 0, errors: [] as string[] };
    let modeLabel = "";

    const phaseLabel = (phase?: string) => {
      switch (phase) {
        case "discover":
          return "Buscando licitaciones por fecha…";
        case "compra_agil":
          return "Buscando Compra Ágil (72 h + keywords)…";
        case "finalize":
          return "Completando fechas y estados…";
        case "enrich":
        default:
          return null;
      }
    };

    try {
      while (guard < 200) {
        let res: Response;
        try {
          res = await fetch("/api/ingest/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ continue: continueBatch, scope }),
          });
          networkRetries = 0;
        } catch (fetchErr) {
          const fetchMsg = fetchErr instanceof Error ? fetchErr.message : "Error";
          if (fetchMsg === "Failed to fetch" && networkRetries < 6) {
            networkRetries += 1;
            continueBatch = true;
            setProgress(`Reconectando (${networkRetries}/6)…`);
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          throw fetchErr;
        }

        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          done?: boolean;
          phase?: string;
          summary?: {
            fetched: number;
            created: number;
            updated: number;
            archived?: number;
            errors: string[];
            mode?: string;
          };
          progress?: { total: number; processed: number };
        };

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Error HTTP ${res.status}`);
        }

        const s = data.summary!;
        aggregated = {
          fetched: s.fetched,
          created: s.created,
          updated: s.updated,
          archived: s.archived ?? aggregated.archived,
          errors: s.errors ?? [],
        };
        modeLabel =
          s.mode === "initial"
            ? "carga inicial (72 h)"
            : aggregated.fetched === 0
              ? "actualización rápida (sin cola pendiente)"
              : "actualización incremental";

        const phaseText = phaseLabel(data.phase);
        if (data.progress && data.progress.total > 0) {
          setProgress(
            phaseText ??
              `Procesando ${data.progress.processed} de ${data.progress.total}…`
          );
        } else if (phaseText) {
          setProgress(phaseText);
        }

        if (data.done) break;
        continueBatch = true;
        guard += 1;
      }

      const avisos = aggregated.errors.filter(Boolean);
      setResult(
        `${modeLabel}: ${aggregated.fetched} en cola · ${aggregated.created} nuevos · ${aggregated.updated} actualizados` +
          (aggregated.archived > 0 ? ` · ${aggregated.archived} archivados al historial` : "") +
          (avisos.length ? ` · ${avisos.length} avisos` : "")
      );
      if (avisos.length) {
        setError(avisos.slice(0, 2).join(" · "));
      }
      setProgress(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg === "Failed to fetch") {
        setError(
          "Se perdió la conexión (timeout). Pulsa Sincronizar de nuevo; retomará la cola pendiente."
        );
      } else {
        setError(msg);
      }
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }

  const isCa = scope === "compra_agil";
  const buttonLabel = loading
    ? isCa
      ? "Sincronizando CA…"
      : "Sincronizando licitaciones…"
    : isFirstSync
      ? isCa
        ? "Sincronizar Compra Ágil (72 h)"
        : "Sincronizar Licitaciones (72 h)"
      : isCa
        ? "Sincronizar Compra Ágil"
        : "Sincronizar Licitaciones";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="brand" size="sm" disabled={loading} onClick={handleSync}>
          {buttonLabel}
        </Button>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <p>
            Última sync manual:{" "}
            <strong className="text-foreground">{lastManualSyncLabel}</strong>
          </p>
          <p>
            Última sync automática (00:01):{" "}
            <strong className="text-foreground">{lastCronSyncLabel}</strong>
          </p>
          {!isFirstSync && (
            <p className="text-[10px]">
              Última actualización (cualquier origen): {lastSyncLabel}
            </p>
          )}
        </div>
      </div>
      {progress && <p className="text-xs font-medium text-[#11233d]">{progress}</p>}
      {!isFirstSync && !loading && (
        <p className="text-xs text-muted-foreground">
          {isCa
            ? "Busca Compra Ágil desde la última sync (o 72 h la primera vez). Cron nocturno 00:01."
            : "Busca licitaciones desde la última sync (o 72 h la primera vez). Cron nocturno 00:01."}
        </p>
      )}
      {result && (
        <Alert>
          <AlertDescription>{result}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
