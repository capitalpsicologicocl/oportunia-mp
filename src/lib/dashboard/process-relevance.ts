import { createServiceClient } from "@/lib/supabase/server";
import { isExcluded, keywordMatchesInText, normalizeMatchText } from "@/lib/dashboard/content-match";
import { matchesRubrosUnspsc } from "@/lib/dashboard/unspsc-match";
import { normalizeOrgRubros, unspscCodesForMatching } from "@/lib/onboarding/rubros-unspsc";
import { DEFAULT_ORG_ID } from "@/types/database";

export interface OrgContentFilters {
  keywords: string[];
  rubros: Array<{ codigo_unspsc: string; nombre: string }>;
  kanbanProcessIds: Set<string>;
}

export function buildProcessSearchText(
  row: Pick<
    { nombre: string | null; servicios_requeridos: string | null; descripcion?: string | null },
    "nombre" | "servicios_requeridos" | "descripcion"
  >
): string {
  return normalizeMatchText(
    `${row.nombre ?? ""} ${row.servicios_requeridos ?? ""} ${row.descripcion ?? ""}`
  );
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((k) => keywordMatchesInText(text, k));
}

function matchesRubros(text: string, rubros: Array<{ nombre: string }>): boolean {
  const normalized = normalizeMatchText(text);
  return rubros.some((r) => normalized.includes(normalizeMatchText(r.nombre)));
}

export function matchesOrgContentFilters(
  text: string,
  keywords: string[],
  rubros: Array<{ nombre: string; codigo_unspsc?: string }>,
  unspscCodigos?: string[] | null
): boolean {
  if (isExcluded(text)) return false;
  if (keywords.length === 0 && rubros.length === 0) return false;
  const byKeyword = keywords.length > 0 && matchesKeywords(text, keywords);
  const byRubro = rubros.length > 0 && matchesRubros(text, rubros);
  const byUnspsc =
    rubros.length > 0 &&
    matchesRubrosUnspsc(unspscCodigos ?? [], unspscCodesForMatching(rubros));
  if (keywords.length === 0) return byRubro || byUnspsc;
  if (rubros.length === 0) return byKeyword;
  return byKeyword || byRubro || byUnspsc;
}

export function isProcessRelevant(
  process: {
    id: string;
    nombre: string | null;
    servicios_requeridos: string | null;
    descripcion?: string | null;
    adjudicado_a_mi?: boolean;
    rubros_unspsc?: string[] | null;
  },
  filters: OrgContentFilters
): boolean {
  if (process.adjudicado_a_mi) return true;
  if (filters.kanbanProcessIds.has(process.id)) return true;
  return matchesOrgContentFilters(
    buildProcessSearchText(process),
    filters.keywords,
    filters.rubros,
    process.rubros_unspsc
  );
}

export async function loadOrgContentFilters(): Promise<OrgContentFilters> {
  const supabase = createServiceClient();

  const [{ data: keywordRows }, { data: rubroRows }, { data: kanbanRows }] = await Promise.all([
    supabase
      .from("keywords")
      .select("palabra")
      .eq("organization_id", DEFAULT_ORG_ID)
      .eq("activa", true),
    supabase
      .from("selected_rubros")
      .select("codigo_unspsc, nombre")
      .eq("organization_id", DEFAULT_ORG_ID),
    supabase.from("kanban_cards").select("process_id").eq("organization_id", DEFAULT_ORG_ID),
  ]);

  return {
    keywords: (keywordRows ?? []).map((k) => k.palabra),
    rubros: normalizeOrgRubros(rubroRows ?? []),
    kanbanProcessIds: new Set((kanbanRows ?? []).map((k) => k.process_id)),
  };
}
