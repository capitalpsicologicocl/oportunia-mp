import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createServiceClient();
  const { organizationId, userId } = session;

  const [notesRes, notepadRes, tasksRes] = await Promise.all([
    supabase
      .from("user_sticky_notes")
      .select("id, title, body, color, sort_order, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("user_notepad")
      .select("content, updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_tasks")
      .select("id, title, done, due_date, sort_order, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (notesRes.error) return NextResponse.json({ error: notesRes.error.message }, { status: 500 });
  if (notepadRes.error) return NextResponse.json({ error: notepadRes.error.message }, { status: 500 });
  if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });

  return NextResponse.json({
    notes: notesRes.data ?? [],
    notepad: notepadRes.data?.content ?? "",
    tasks: tasksRes.data ?? [],
  });
}
