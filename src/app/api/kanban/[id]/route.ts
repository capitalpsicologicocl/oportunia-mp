import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createMentionNotification } from "@/lib/notifications/mentions";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBacklogJson, type BacklogItem } from "@/lib/kanban/backlog";
import { recalcularAnalisis } from "@/lib/kanban/financial-analysis";
import { getArchivedKanbanCards, getKanbanBoard } from "@/lib/kanban/queries";
import type { KanbanCardUpdatePayload } from "@/lib/kanban/types";
import { DEFAULT_ORG_ID, type KanbanColumna } from "@/types/database";

export const runtime = "nodejs";

const VALID_COLUMNAS: KanbanColumna[] = [
  "preevaluacion",
  "preparacion_pt",
  "postulada",
  "ejecucion",
  "cierre",
  "pagada",
];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as KanbanCardUpdatePayload;
    const supabase = createServiceClient();

    const { data: card, error: cardError } = await supabase
      .from("kanban_cards")
      .select(
        `
        id,
        monto_ofertado,
        responsable_user_id,
        backlog_json,
        process_id,
        processes (
          codigo_externo,
          nombre
        )
      `
      )
      .eq("id", id)
      .eq("organization_id", DEFAULT_ORG_ID)
      .maybeSingle();

    if (cardError) throw new Error(cardError.message);
    if (!card) return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });

    const cardUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.columna !== undefined) {
      if (!VALID_COLUMNAS.includes(body.columna)) {
        return NextResponse.json({ error: "Columna inválida" }, { status: 400 });
      }
      cardUpdate.columna = body.columna;
    }
    if (body.orden !== undefined) cardUpdate.orden = body.orden;
    if (body.descartado !== undefined) {
      cardUpdate.descartado = body.descartado;
      cardUpdate.descartado_at = body.descartado ? new Date().toISOString() : null;
      if (body.descartado) cardUpdate.en_pipeline = false;
    }
    if (body.en_pipeline !== undefined) {
      cardUpdate.en_pipeline = body.en_pipeline;
    }
    if (body.estado_interno !== undefined) cardUpdate.estado_interno = body.estado_interno;

    if (body.responsable_user_id !== undefined) {
      const nextUserId = body.responsable_user_id;
      const previousUserId = card.responsable_user_id as string | null;

      if (nextUserId === null) {
        cardUpdate.responsable_user_id = null;
        cardUpdate.responsable = null;
      } else {
        const { data: assignee, error: assigneeError } = await supabase
          .from("org_users")
          .select("id, nombre")
          .eq("id", nextUserId)
          .eq("organization_id", DEFAULT_ORG_ID)
          .eq("activo", true)
          .maybeSingle();

        if (assigneeError) throw new Error(assigneeError.message);
        if (!assignee) {
          return NextResponse.json({ error: "Usuario del equipo no encontrado" }, { status: 400 });
        }

        cardUpdate.responsable_user_id = assignee.id;
        cardUpdate.responsable = `@${assignee.nombre}`;

        if (assignee.id !== previousUserId && assignee.id !== session.userId) {
          const processRaw = card.processes as
            | { codigo_externo: string; nombre: string }
            | { codigo_externo: string; nombre: string }[]
            | null;
          const process = Array.isArray(processRaw) ? processRaw[0] : processRaw;

          await createMentionNotification({
            userId: assignee.id,
            kanbanCardId: card.id,
            processId: card.process_id,
            assignerName: session.nombre,
            processCodigo: process?.codigo_externo ?? "Proceso",
            processNombre: process?.nombre ?? "",
          });
        }
      }
    } else if (body.responsable !== undefined) {
      cardUpdate.responsable = body.responsable;
    }

    if (body.fecha_postulacion !== undefined) cardUpdate.fecha_postulacion = body.fecha_postulacion;
    if (body.monto_ofertado !== undefined) cardUpdate.monto_ofertado = body.monto_ofertado;
    if (body.observaciones !== undefined) cardUpdate.observaciones = body.observaciones;
    if (body.analisis_financiero !== undefined) {
      cardUpdate.analisis_financiero = body.analisis_financiero;
    }
    if (body.analisis_financiero_json !== undefined) {
      const monto = body.monto_ofertado ?? card.monto_ofertado;
      cardUpdate.analisis_financiero_json = recalcularAnalisis(body.analisis_financiero_json, monto);
    }
    if (body.costos !== undefined) cardUpdate.costos = body.costos;

    if (body.contacto) {
      const c = body.contacto;
      if (c.contacto_contraparte !== undefined) cardUpdate.contacto_contraparte = c.contacto_contraparte;
      if (c.contacto_responsable !== undefined) cardUpdate.contacto_responsable = c.contacto_responsable;
      if (c.contacto_email !== undefined) cardUpdate.contacto_email = c.contacto_email;
      if (c.contacto_telefono !== undefined) cardUpdate.contacto_telefono = c.contacto_telefono;
      if (c.contacto_direccion !== undefined) cardUpdate.contacto_direccion = c.contacto_direccion;
      if (c.direccion_ejecucion !== undefined) cardUpdate.direccion_ejecucion = c.direccion_ejecucion;
    }
    if (body.fechas_ejecucion !== undefined) cardUpdate.fechas_ejecucion = body.fechas_ejecucion;
    if (body.link_propuesta_tecnica !== undefined) cardUpdate.link_propuesta_tecnica = body.link_propuesta_tecnica;
    if (body.link_carpeta_interna !== undefined) cardUpdate.link_carpeta_interna = body.link_carpeta_interna;
    if (body.campos_descriptivos !== undefined) {
      cardUpdate.campos_descriptivos_json = body.campos_descriptivos;
    }
    if (body.ubicaciones_json !== undefined) {
      cardUpdate.ubicaciones_json = body.ubicaciones_json;
    }
    if (body.backlog_json !== undefined) {
      cardUpdate.backlog_json = body.backlog_json;
    }

    const { error: updateError } = await supabase.from("kanban_cards").update(cardUpdate).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    if (body.backlog_json !== undefined) {
      const previousBacklog = parseBacklogJson(card.backlog_json);
      const nextBacklog = parseBacklogJson(body.backlog_json);
      await notifyNewBacklogAssignees({
        supabase,
        session,
        cardId: card.id,
        processId: card.process_id,
        processRaw: card.processes,
        previous: previousBacklog,
        next: nextBacklog,
      });
    }

    if (body.otec !== undefined) {
      if (body.otec === null) {
        await supabase.from("otec_fields").delete().eq("card_id", id);
      } else {
        await supabase.from("otec_fields").upsert(
          {
            card_id: id,
            modalidad: body.otec.modalidad ?? null,
            codigo_sence: body.otec.codigo_sence ?? null,
            num_participantes: body.otec.num_participantes ?? null,
            duracion_horas: body.otec.duracion_horas ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "card_id" }
        );
      }
    }

    if (body.custom_fields !== undefined) {
      await supabase.from("kanban_custom_fields").delete().eq("card_id", id);
      const fields = body.custom_fields.filter((f) => f.field_key.trim());
      if (fields.length > 0) {
        const { error: fieldsError } = await supabase.from("kanban_custom_fields").insert(
          fields.map((field) => ({
            card_id: id,
            field_key: field.field_key.trim(),
            field_value: field.field_value,
            field_type: field.field_type,
          }))
        );
        if (fieldsError) throw new Error(fieldsError.message);
      }
    }

    const board = await getKanbanBoard();
    let updated = board.cards.find((row) => row.id === id);
    if (!updated) {
      const archivedCards = await getArchivedKanbanCards();
      updated = archivedCards.find((row) => row.id === id);
    }
    if (!updated) {
      revalidateDashboardPaths();
      return NextResponse.json({ ok: true, discarded: Boolean(body.descartado) });
    }

    revalidateDashboardPaths();
    return NextResponse.json({ ok: true, card: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function revalidateDashboardPaths() {
  revalidatePath("/compra-agil");
  revalidatePath("/licitaciones");
  revalidatePath("/kanban");
  revalidatePath("/perfil");
}

async function notifyNewBacklogAssignees({
  supabase,
  session,
  cardId,
  processId,
  processRaw,
  previous,
  next,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
  cardId: string;
  processId: string;
  processRaw: unknown;
  previous: BacklogItem[];
  next: BacklogItem[];
}) {
  const prevById = new Map(previous.map((item) => [item.id, item]));
  const process = Array.isArray(processRaw)
    ? (processRaw[0] as { codigo_externo: string; nombre: string } | undefined)
    : (processRaw as { codigo_externo: string; nombre: string } | null);

  for (const item of next) {
    const prev = prevById.get(item.id);
    const userId = item.responsable_user_id;
    if (!userId || userId === prev?.responsable_user_id || userId === session.userId) continue;

    const { data: assignee } = await supabase
      .from("org_users")
      .select("id")
      .eq("id", userId)
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("activo", true)
      .maybeSingle();

    if (!assignee) continue;

    await createMentionNotification({
      userId: assignee.id,
      kanbanCardId: cardId,
      processId,
      assignerName: session.nombre,
      processCodigo: process?.codigo_externo ?? "Proceso",
      processNombre: `${process?.nombre ?? ""} — ${item.titulo}`.trim(),
    });
  }
}
