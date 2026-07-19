import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    due_date?: string | null;
    sort_order?: number;
  };

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_tasks")
    .insert({
      organization_id: session.organizationId,
      user_id: session.userId,
      title,
      due_date: body.due_date?.trim() || null,
      sort_order: body.sort_order ?? 0,
    })
    .select("id, title, done, due_date, sort_order, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as {
    id?: string;
    title?: string;
    done?: boolean;
    due_date?: string | null;
    sort_order?: number;
  };

  if (!body.id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.done !== undefined) update.done = body.done;
  if (body.due_date !== undefined) update.due_date = body.due_date?.trim() || null;
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_tasks")
    .update(update)
    .eq("id", body.id)
    .eq("organization_id", session.organizationId)
    .eq("user_id", session.userId)
    .select("id, title, done, due_date, sort_order, created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  return NextResponse.json({ task: data });
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_tasks")
    .delete()
    .eq("id", body.id)
    .eq("organization_id", session.organizationId)
    .eq("user_id", session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
