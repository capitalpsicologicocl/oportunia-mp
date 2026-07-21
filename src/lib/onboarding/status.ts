import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

export interface OnboardingStatus {
  organization: {
    id: string;
    name: string;
    razon_social: string | null;
    nombre_fantasia: string | null;
    rut: string | null;
    rut_dv: string | null;
    onboarding_completed: boolean;
  } | null;
  settings: {
    anthropic_api_key_status: string;
    has_anthropic_key: boolean;
    has_chilecompra_ticket: boolean;
    otec_fields_enabled: boolean;
  } | null;
  selected_rubros_count: number;
  keywords_count: number;
}

export const getOnboardingStatus = cache(async (): Promise<OnboardingStatus> => {
  const supabase = createServiceClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, razon_social, nombre_fantasia, rut, rut_dv, onboarding_completed")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  const { data: settings } = await supabase
    .from("org_settings")
    .select("anthropic_api_key_encrypted, anthropic_api_key_status, chilecompra_ticket, otec_fields_enabled")
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();

  const { count: rubrosCount } = await supabase
    .from("selected_rubros")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID);

  const { count: keywordsCount } = await supabase
    .from("keywords")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID);

  return {
    organization,
    settings: settings
      ? {
          anthropic_api_key_status: settings.anthropic_api_key_status,
          has_anthropic_key: Boolean(settings.anthropic_api_key_encrypted),
          has_chilecompra_ticket: Boolean(settings.chilecompra_ticket),
          otec_fields_enabled: settings.otec_fields_enabled,
        }
      : null,
    selected_rubros_count: rubrosCount ?? 0,
    keywords_count: keywordsCount ?? 0,
  };
});
