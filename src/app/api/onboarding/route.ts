import { NextRequest, NextResponse } from "next/server";
import { validateAnthropicKey } from "@/lib/anthropic/client";
import { validateChilecompraTicket } from "@/lib/chilecompra/proveedor";
import { encryptSecret } from "@/lib/crypto";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import { KEYWORD_TEMPLATE } from "@/lib/onboarding/templates";
import { resolveRubroUnspsc } from "@/lib/onboarding/rubros-unspsc";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID, type ApiKeyStatus } from "@/types/database";

interface OnboardingPayload {
  step: "empresa" | "conexiones" | "rubros" | "completar";
  name?: string;
  razon_social?: string;
  nombre_fantasia?: string;
  rut?: string;
  rut_dv?: string;
  anthropic_api_key?: string;
  chilecompra_ticket?: string;
  rubros?: Array<{ codigo_unspsc: string; nombre: string; sugerido_por_rut?: boolean }>;
}

export async function GET() {
  try {
    const status = await getOnboardingStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as OnboardingPayload;
    const supabase = createServiceClient();

    if (body.step === "empresa") {
      const displayName =
        body.nombre_fantasia?.trim() || body.razon_social?.trim() || body.name?.trim();
      if (!displayName) {
        return NextResponse.json({ error: "Razón social o nombre de fantasía requerido" }, { status: 400 });
      }

      const rutClean = body.rut?.replace(/\./g, "").replace(/-/g, "").toUpperCase() ?? "";
      const { error } = await supabase
        .from("organizations")
        .update({
          name: displayName,
          razon_social: body.razon_social?.trim() || displayName,
          nombre_fantasia: body.nombre_fantasia?.trim() || displayName,
          rut: rutClean.length > 1 ? rutClean.slice(0, -1) : null,
          rut_dv: body.rut_dv || (rutClean.length > 1 ? rutClean.slice(-1) : null),
          updated_at: new Date().toISOString(),
        })
        .eq("id", DEFAULT_ORG_ID);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, step: "empresa" });
    }

    if (body.step === "conexiones") {
      const { data: current } = await supabase
        .from("org_settings")
        .select("anthropic_api_key_encrypted, chilecompra_ticket")
        .eq("organization_id", DEFAULT_ORG_ID)
        .single();

      const apiKey = body.anthropic_api_key?.trim() || null;
      const ticket = body.chilecompra_ticket?.trim() || current?.chilecompra_ticket || null;

      if (!apiKey && !current?.anthropic_api_key_encrypted) {
        return NextResponse.json({ error: "API key de Anthropic requerida" }, { status: 400 });
      }
      if (!ticket) {
        return NextResponse.json({ error: "Ticket de ChileCompra requerido" }, { status: 400 });
      }

      let anthropicStatus: ApiKeyStatus = "valid";
      let encrypted = current?.anthropic_api_key_encrypted ?? null;

      if (apiKey) {
        const anthropicCheck = await validateAnthropicKey(apiKey);
        if (!anthropicCheck.valid) {
          return NextResponse.json(
            { error: anthropicCheck.message, status: anthropicCheck.status },
            { status: 400 }
          );
        }
        anthropicStatus = anthropicCheck.status;
        encrypted = encryptSecret(apiKey);
      }

      const ticketToValidate = body.chilecompra_ticket?.trim() || ticket;
      const ticketValid = await validateChilecompraTicket(ticketToValidate);
      if (!ticketValid) {
        return NextResponse.json(
          { error: "Ticket de ChileCompra inválido o sin acceso a la API" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("org_settings")
        .update({
          anthropic_api_key_encrypted: encrypted,
          anthropic_api_key_status: anthropicStatus,
          chilecompra_ticket: ticketToValidate,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", DEFAULT_ORG_ID);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, step: "conexiones" });
    }

    if (body.step === "rubros") {
      if (!body.rubros?.length) {
        return NextResponse.json({ error: "Selecciona al menos un rubro" }, { status: 400 });
      }

      await supabase.from("selected_rubros").delete().eq("organization_id", DEFAULT_ORG_ID);

      const rows = body.rubros.map((r) => ({
        organization_id: DEFAULT_ORG_ID,
        codigo_unspsc: resolveRubroUnspsc(r.codigo_unspsc),
        nombre: r.nombre,
        sugerido_por_rut: r.sugerido_por_rut ?? false,
      }));

      const { error } = await supabase.from("selected_rubros").insert(rows);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, step: "rubros", count: rows.length });
    }

    if (body.step === "completar") {
      const keywordRows = KEYWORD_TEMPLATE.map((k) => ({
        organization_id: DEFAULT_ORG_ID,
        categoria: k.categoria,
        palabra: k.palabra,
        activa: true,
      }));

      await supabase.from("keywords").upsert(keywordRows, {
        onConflict: "organization_id,categoria,palabra",
        ignoreDuplicates: true,
      });

      const { error } = await supabase
        .from("organizations")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("id", DEFAULT_ORG_ID);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, completed: true });
    }

    return NextResponse.json({ error: "Paso no reconocido" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
