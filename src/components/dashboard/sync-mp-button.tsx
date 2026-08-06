"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SyncScope } from "@/lib/ingest/sync-refresh";

type SyncApiResponse = {
  ok?: boolean;
  error?: string;
  done?: boolean;
  partial?: boolean;
  progress?: { total: number; processed: number };
  phase?: string;
  summary?: {
    fetched: number;
    created: number;
    updated: number;
    archived?: number;
    errors: string[];
    mode?: string;
  };
};

export function SyncMercadoPublicoButton({
  scope,
  isFirstSync: isFirstSyncProp,
  lastSyncLabel: lastSyncLabelProp,
  lastManualSyncLabel: lastManualSyncLabelProp,
  lastCronSyncLabel: lastCronSyncLabelProp,
  lastCronAttemptLabel: lastCronAttemptLabelProp,
  lastCronError: lastCronErrorProp,
  lastCronSummaryPartial: lastCronSummaryPartialProp,
  lastCronSummaryText: lastCronSummaryTextProp,
}: {
  scope: Exclude<SyncScope, "all">;
  isFirstSync?: boolean;
  lastSyncLabel?: string;
  lastManualSyncLabel?: string;
  lastCronSyncLabel?: string;
  lastCronAttemptLabel?: string;
  lastCronError?: string | null;
  lastCronSummaryPartial?: boolean | null;
  lastCronSummaryText?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionKeepAlive = useRef<ReturnType<typeof setInterval> | null>(null);
  const [syncMeta, setSyncMeta] = useState({
    isFirstSync: true,
    lastSyncLabel: "Nunca",
    lastManualSyncLabel: "Nunca",
    lastCronSyncLabel: "Nunca",
    lastCronAttemptLabel: "Nunca",
    lastCronError: null as string | null,
    lastCronSummaryPartial: null as boolean | null,
    lastCronSummaryText: null as string | null,
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
          lastCronAttemptLabel?: string;
          lastCronError?: string | null;
          lastCronSummaryPartial?: boolean | null;
          lastCronSummaryText?: string | null;
        }) => {
          setSyncMeta({
            isFirstSync: data.isFirstSync ?? true,
            lastSyncLabel: data.lastSyncLabel ?? "Nunca",
            lastManualSyncLabel: data.lastManualSyncLabel ?? "Nunca",
            lastCronSyncLabel: data.lastCronSyncLabel ?? "Nunca",
            lastCronAttemptLabel: data.lastCronAttemptLabel ?? "Nunca",
            lastCronError: data.lastCronError ?? null,
            lastCronSummaryPartial: data.lastCronSummaryPartial ?? null,
            lastCronSummaryText: data.lastCronSummaryText ?? null,
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

  useEffect(() => {
    return () => {
      if (sessionKeepAlive.current) {
        clearInterval(sessionKeepAlive.current);
      }
    };
  }, []);

  const isFirstSync = isFirstSyncProp ?? syncMeta.isFirstSync;
  const lastSyncLabel = lastSyncLabelProp ?? syncMeta.lastSyncLabel;
  const lastManualSyncLabel = lastManualSyncLabelProp ?? syncMeta.lastManualSyncLabel;
  const lastCronSyncLabel = lastCronSyncLabelProp ?? syncMeta.lastCronSyncLabel;
  const lastCronAttemptLabel = lastCronAttemptLabelProp ?? syncMeta.lastCronAttemptLabel;
  const lastCronError = lastCronErrorProp ?? syncMeta.lastCronError;
  const lastCronSummaryPartial =
    lastCronSummaryPartialProp ?? syncMeta.lastCronSummaryPartial;
  const lastCronSummaryText = lastCronSummaryTextProp ?? syncMeta.lastCronSummaryText;

  function startSessionKeepAlive() {
    if (sessionKeepAlive.current) clearInterval(sessionKeepAlive.current);
    sessionKeepAlive.current = setInterval(() => {
      void fetch("/api/auth/refresh", { method: "POST" }).catch(() => undefined);
    }, 3 * 60 * 1000);
  }

  function stopSessionKeepAlive() {
    if (sessionKeepAlive.current) {
      clearInterval(sessionKeepAlive.current);
      sessionKeepAlive.current = null;
    }
  }

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(
      isFirstSync
        ? "Sincronización inicial en servidor (puede tardar varios minutos)…"
        : "Actualizando dashboard en servidor (varias rondas cortas, ~3–5 min)…"
    );
    startSessionKeepAlive();

    try {
      let continueBatch = false;
      let rounds = 0;
      const maxRounds = 40;
      let timeoutRetries = 0;
      const maxTimeoutRetries = 4;
      let lastData: SyncApiResponse | null = null;

      while (rounds < maxRounds) {
        rounds += 1;
        const res = await fetch("/api/ingest/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, continueBatch }),
        });

        const raw = await res.text();
        let data: SyncApiResponse;
        try {
          data = JSON.parse(raw) as SyncApiResponse;
          timeoutRetries = 0;
        } catch {
          const isGatewayTimeout = res.status === 504 || res.status === 502;
          if (isGatewayTimeout && timeoutRetries < maxTimeoutRetries) {
            timeoutRetries += 1;
            setProgress(
              `Timeout del servidor, reintentando (${timeoutRetries}/${maxTimeoutRetries})…`
            );
            await new Promise((resolve) => setTimeout(resolve, 2500));
            rounds -= 1;
            continueBatch = true;
            continue;
          }
          throw new Error(
            isGatewayTimeout
              ? "El servidor tardó demasiado. Pulsa Sincronizar de nuevo; retomará donde quedó."
              : `Respuesta inválida del servidor (${res.status}): ${raw.slice(0, 100)}`
          );
        }

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error ?? `Error HTTP ${res.status}`);
        }

        lastData = data;

        const { total = 0, processed = 0 } = data.progress ?? {};
        const phaseLabel =
          data.phase === "compra_agil"
            ? "buscando CA en MP"
            : data.phase === "enrich"
              ? "importando detalle"
              : data.phase === "discover"
                ? "descubriendo"
                : "procesando";

        setProgress(
          total > 0
            ? `${phaseLabel}: ${processed}/${total} (paso ${rounds})…`
            : `${phaseLabel} (paso ${rounds})…`
        );

        if (data.done) break;
        continueBatch = true;
      }

      const data = lastData;
      if (!data?.summary) {
        throw new Error("La sync no devolvió resultados");
      }

      const s = data.summary;
      const avisos = (s.errors ?? []).filter(Boolean);
      const modeLabel =
        s.mode === "initial"
          ? "carga inicial"
          : s.fetched === 0
            ? "actualización rápida"
            : "actualización incremental";

      if (!data.done) {
        setError(
          "Sync parcial por tiempo. Pulsa Sincronizar otra vez para continuar (retoma automáticamente)."
        );
      }

      setResult(
        `${modeLabel}: ${s.fetched} revisados · ${s.created} nuevos · ${s.updated} actualizados` +
          (s.archived && s.archived > 0 ? ` · ${s.archived} archivados` : "") +
          (data.partial && !data.done ? " · incompleta" : "") +
          (avisos.length ? ` · ${avisos.length} avisos` : "")
      );
      if (avisos.length && data.done) {
        setError(avisos.slice(0, 2).join(" · "));
      }
      setProgress(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(
        msg === "Failed to fetch"
          ? "Timeout de red. Vuelve a pulsar Sincronizar; el servidor retoma automáticamente."
          : msg
      );
      setProgress(null);
    } finally {
      stopSessionKeepAlive();
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
            {lastCronSummaryPartial && lastCronSyncLabel !== "Nunca" && (
              <span className="text-amber-700"> · parcial</span>
            )}
          </p>
          {lastCronSummaryText && (
            <p className="text-[10px] text-muted-foreground">Último cron: {lastCronSummaryText}</p>
          )}
          {lastCronSyncLabel === "Nunca" && lastCronAttemptLabel !== "Nunca" && (
            <p className="text-[10px] text-amber-800">
              Cron intentó: {lastCronAttemptLabel}
              {lastCronError ? ` · error: ${lastCronError}` : ""}
            </p>
          )}
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
            ? "Sync en servidor: busca por tus keywords/rubros (como MP) y novedades recientes (~2–3 min)."
            : "Sync en servidor: busca licitaciones recientes (~1–2 min). Cron nocturno 00:01."}
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
