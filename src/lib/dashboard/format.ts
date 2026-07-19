export function formatFechaCL(iso: string | null | undefined): string {
  if (!iso) return "No disponible";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function postulabilidadLabel(value: string | null): string {
  const map: Record<string, string> = {
    alta: "Alta",
    media: "Media",
    baja: "Baja",
    no_aplica: "No aplica",
    pendiente: "Pendiente",
    revisar: "Revisar",
  };
  return value ? (map[value] ?? value) : "—";
}

export function postulabilidadClass(value: string | null): string {
  switch (value) {
    case "alta":
      return "bg-emerald-100 text-emerald-800";
    case "media":
      return "bg-blue-100 text-blue-800";
    case "baja":
      return "bg-amber-100 text-amber-800";
    case "revisar":
      return "bg-orange-100 text-orange-800";
    case "no_aplica":
      return "bg-zinc-100 text-zinc-600";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

export function formatHora(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  return value.trim();
}

export function tipoLabel(tipo: string): string {
  return tipo === "compra_agil" ? "Compra Ágil" : "Licitación";
}
