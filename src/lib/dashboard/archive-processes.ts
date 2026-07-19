import { createServiceClient } from "@/lib/supabase/server";
import { isClosedMpEstado, isTerminalMpEstado } from "@/lib/ingest/sync-refresh";
import { DEFAULT_ORG_ID } from "@/types/database";

export const DASHBOARD_ARCHIVE_CLOSED_DAYS = 30;
const ARCHIVE_SCAN_BATCH = 500;

export type DashboardArchiveCandidate = {
  id: string;
  estado: string | null;
  adjudicado_a_mi: boolean;
  adjudicado_rut: string | null;
  fecha_cierre: string | null;
  dashboard_archived_at: string | null;
  en_pipeline: boolean;
};

export function shouldArchiveDashboardProcess(row: DashboardArchiveCandidate): boolean {
  if (row.dashboard_archived_at) return false;
  if (row.adjudicado_a_mi) return false;
  if (row.en_pipeline) return false;

  const estado = row.estado ?? "";

  if (isTerminalMpEstado(estado) && !row.adjudicado_a_mi) {
    return true;
  }

  if (/adjudicad|proveedor seleccionado/i.test(estado) && !row.adjudicado_a_mi) {
    return true;
  }

  if (row.adjudicado_rut && !row.adjudicado_a_mi) {
    return true;
  }

  if (isClosedMpEstado(estado) || row.fecha_cierre) {
    const cierreMs = row.fecha_cierre ? new Date(row.fecha_cierre).getTime() : NaN;
    if (!Number.isNaN(cierreMs)) {
      const daysClosed = (Date.now() - cierreMs) / (1000 * 60 * 60 * 24);
      if (daysClosed > DASHBOARD_ARCHIVE_CLOSED_DAYS) return true;
    }
  }

  return false;
}

async function loadActivePipelineIds(processIds: string[]): Promise<Set<string>> {
  if (processIds.length === 0) return new Set();

  const supabase = createServiceClient();
  const pipelineIds = new Set<string>();

  for (let i = 0; i < processIds.length; i += 100) {
    const chunk = processIds.slice(i, i + 100);
    const { data } = await supabase
      .from("kanban_cards")
      .select("process_id")
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("en_pipeline", true)
      .in("process_id", chunk);

    for (const row of data ?? []) {
      pipelineIds.add(row.process_id as string);
    }
  }

  return pipelineIds;
}

async function archiveStaleDashboardBatch(): Promise<number> {
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("processes")
    .select("id, estado, adjudicado_a_mi, adjudicado_rut, fecha_cierre, dashboard_archived_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("synced_via_dashboard", true)
    .is("dashboard_archived_at", null)
    .limit(ARCHIVE_SCAN_BATCH);

  if (error) throw new Error(error.message);
  if (!rows?.length) return 0;

  const ids = rows.map((r) => r.id as string);
  const pipelineIds = await loadActivePipelineIds(ids);

  const toArchive = rows.filter((row) =>
    shouldArchiveDashboardProcess({
      id: row.id as string,
      estado: row.estado as string | null,
      adjudicado_a_mi: Boolean(row.adjudicado_a_mi),
      adjudicado_rut: row.adjudicado_rut as string | null,
      fecha_cierre: row.fecha_cierre as string | null,
      dashboard_archived_at: row.dashboard_archived_at as string | null,
      en_pipeline: pipelineIds.has(row.id as string),
    })
  );

  if (toArchive.length === 0) return 0;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("processes")
    .update({ dashboard_archived_at: now, updated_at: now })
    .in(
      "id",
      toArchive.map((r) => r.id as string)
    );

  if (updateError) throw new Error(updateError.message);
  return toArchive.length;
}

/** Mueve procesos terminales / cerrados >30d al historial (no Kanban, no adjudicadas tuyas). */
export async function archiveStaleDashboardProcesses(): Promise<{ archived: number }> {
  let archived = 0;
  for (let round = 0; round < 30; round += 1) {
    const batch = await archiveStaleDashboardBatch();
    archived += batch;
    if (batch === 0) break;
  }
  return { archived };
}

export async function getDashboardArchiveCounts(): Promise<{ active: number; archived: number }> {
  const supabase = createServiceClient();
  const base = () =>
    supabase
      .from("processes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("synced_via_dashboard", true);

  const [{ count: active }, { count: archived }] = await Promise.all([
    base().is("dashboard_archived_at", null),
    base().not("dashboard_archived_at", "is", null),
  ]);

  return { active: active ?? 0, archived: archived ?? 0 };
}

/** Descarte manual desde dashboard → historial (no Kanban). */
export async function archiveProcessesToHistorial(processIds: string[]): Promise<number> {
  if (!processIds.length) return 0;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("processes")
    .update({ dashboard_archived_at: now, updated_at: now })
    .eq("organization_id", DEFAULT_ORG_ID)
    .in("id", processIds)
    .is("dashboard_archived_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function restoreProcessesToDashboard(processIds: string[]): Promise<number> {
  if (!processIds.length) return 0;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("processes")
    .update({ dashboard_archived_at: null, updated_at: now })
    .eq("organization_id", DEFAULT_ORG_ID)
    .in("id", processIds)
    .not("dashboard_archived_at", "is", null)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
