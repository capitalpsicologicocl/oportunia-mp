import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const NOTE_COLORS = new Set(["yellow", "pink", "blue", "green", "purple"]);

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    body?: string;
    color?: string;
    sort_order?: number;
  };

  const color = body.color && NOTE_COLORS.has(body.color) ? body.color : "yellow";

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_sticky_notes")
    .insert({
      organization_id: session.organizationId,
      user_id: session.userId,
      title: body.title?.trim() ?? "",
      body: body.body?.trim() ?? "",
      color,
      sort_order: body.sort_order ?? 0,
    })
    .select("id, title, body, color, sort_order, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as {
    id?: string;
    title?: string;
    body?: string;
    color?: string;
    sort_order?: number;
  };

  if (!body.id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.body !== undefined) update.body = body.body.trim();
  if (body.color !== undefined && NOTE_COLORS.has(body.color)) update.color = body.color;
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_sticky_notes")
    .update(update)
    .eq("id", body.id)
    .eq("organization_id", session.organizationId)
    .eq("user_id", session.userId)
    .select("id, title, body, color, sort_order, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  return NextResponse.json({ note: data });
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_sticky_notes")
    .delete()
    .eq("id", body.id)
    .eq("organization_id", session.organizationId)
    .eq("user_id", session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
