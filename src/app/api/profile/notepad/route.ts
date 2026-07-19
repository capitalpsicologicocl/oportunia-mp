import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as { content?: string };
  const content = body.content ?? "";

  const supabase = createServiceClient();
  const { error } = await supabase.from("user_notepad").upsert(
    {
      organization_id: session.organizationId,
      user_id: session.userId,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
