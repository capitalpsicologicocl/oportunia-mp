import { formatUbicacionShort, parseLugarEjecucion } from "@/lib/kanban/ubicaciones";

export function formatProcessUbicacionShort(lugar: string | null | undefined): string {
  const parsed = parseLugarEjecucion(lugar ?? null);
  if (parsed.length === 0) return "";
  return formatUbicacionShort(parsed[0]);
}

/** Subtítulo bajo el nombre: «Organismo - Comuna, Región». */
export function formatOrganismoSubtitle(
  organismo: string | null | undefined,
  lugar: string | null | undefined
): string | null {
  const org = organismo?.trim();
  const ubic = formatProcessUbicacionShort(lugar);
  if (org && ubic) return `${org} - ${ubic}`;
  if (org) return org;
  if (ubic) return ubic;
  return null;
}

export function processRegionCodes(lugar: string | null | undefined): string[] {
  return parseLugarEjecucion(lugar ?? null)
    .map((u) => u.region.trim())
    .filter(Boolean);
}

export function processMatchesRegion(
  lugar: string | null | undefined,
  regionFilter: string
): boolean {
  if (!regionFilter) return true;
  const codes = processRegionCodes(lugar);
  return codes.some((c) => c.toLowerCase() === regionFilter.toLowerCase());
}
