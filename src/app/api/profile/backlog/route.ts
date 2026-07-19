import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { parseBacklogJson, type BacklogItem } from "@/lib/kanban/backlog";
import { KANBAN_COLUMN_LABELS } from "@/lib/kanban/columns";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID, type KanbanColumna } from "@/types/database";

export interface ProfileBacklogCard {
  cardId: string;
  codigo: string;
  nombre: string;
  columna: KanbanColumna;
  columnaLabel: string;
  estado_interno: string | null;
  fecha_cierre: string | null;
  items: BacklogItem[];
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kanban_cards")
    .select(
      `
      id,
      columna,
      estado_interno,
      backlog_json,
      en_pipeline,
      descartado,
      processes (
        codigo_externo,
        nombre,
        fecha_cierre
      )
    `
    )
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("en_pipeline", true)
    .eq("descartado", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enDesarrollo: ProfileBacklogCard[] = [];
  const finalizado: ProfileBacklogCard[] = [];

  for (const row of data ?? []) {
    const backlog = parseBacklogJson(row.backlog_json);
    const userItems = backlog.filter((item) => item.responsable_user_id === session.userId);
    if (userItems.length === 0) continue;

    const processRaw = row.processes as
      | { codigo_externo: string; nombre: string; fecha_cierre: string | null }
      | { codigo_externo: string; nombre: string; fecha_cierre: string | null }[]
      | null;
    const process = Array.isArray(processRaw) ? processRaw[0] : processRaw;
    if (!process) continue;

    const columna = row.columna as KanbanColumna;
    const cardBase: Omit<ProfileBacklogCard, "items"> = {
      cardId: row.id,
      codigo: process.codigo_externo,
      nombre: process.nombre,
      columna,
      columnaLabel: KANBAN_COLUMN_LABELS[columna],
      estado_interno: row.estado_interno,
      fecha_cierre: process.fecha_cierre,
    };

    const activeItems = userItems.filter((item) => !item.done);
    if (activeItems.length > 0) {
      enDesarrollo.push({ ...cardBase, items: activeItems });
    }

    const doneItems = userItems.filter((item) => item.done);
    if (doneItems.length > 0) {
      finalizado.push({ ...cardBase, items: doneItems });
    }
  }

  return NextResponse.json({ enDesarrollo, finalizado });
}
