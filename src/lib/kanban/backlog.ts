/** Backlog de tareas por tarjeta Kanban. */

export interface BacklogItem {
  id: string;
  titulo: string;
  fecha_termino: string | null;
  responsable_user_id: string | null;
  responsable_display: string | null;
  done: boolean;
  done_at: string | null;
  predefined: boolean;
}

export const BACKLOG_PREDEFINED_TASKS: string[] = [
  "OC Aceptada",
  "Primer Contacto con contraparte",
  "Reunión de Coordinación",
  "Coordinar Relatores",
  "Confirmar Relatores",
  "Contrato Relatores",
  "Coordinar Coffee",
  "Coordinar Lugar de Ejecución",
  "Coordinar Almuerzo",
  "Confirmar Coffee",
  "Confirmar Almuerzo",
  "Confirmar Lugar de Ejecución",
  "Coordinación de Pasajes",
  "Coordinación Estadía",
  "Confirmación de Pasajes",
  "Confirmación de Estadía",
  "Diseño de Contenido",
  "Diseño de Sesiones",
  "Preparación de Material Digital (PPT)",
  "Preparar Guía de Trabajo",
  "Impresión de Material Digital (PPT)",
  "Impresión Guía de Trabajo",
  "Lista de Asistencia",
  "Elaborar Informe de Cierre",
  "Elaborar Certificados",
  "Enviar Informe de Cierre",
  "Enviar Certificados",
  "Emitir Factura",
  "Pagado",
];

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `bl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyBacklogFromTemplate(): BacklogItem[] {
  return BACKLOG_PREDEFINED_TASKS.map((titulo) => ({
    id: newId(),
    titulo,
    fecha_termino: null,
    responsable_user_id: null,
    responsable_display: null,
    done: false,
    done_at: null,
    predefined: true,
  }));
}

export function emptyBacklogItem(titulo = ""): BacklogItem {
  return {
    id: newId(),
    titulo,
    fecha_termino: null,
    responsable_user_id: null,
    responsable_display: null,
    done: false,
    done_at: null,
    predefined: false,
  };
}

export function parseBacklogJson(raw: unknown): BacklogItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const titulo = typeof row.titulo === "string" ? row.titulo.trim() : "";
      if (!titulo) return null;
      return {
        id: typeof row.id === "string" ? row.id : newId(),
        titulo,
        fecha_termino: typeof row.fecha_termino === "string" ? row.fecha_termino : null,
        responsable_user_id:
          typeof row.responsable_user_id === "string" ? row.responsable_user_id : null,
        responsable_display:
          typeof row.responsable_display === "string" ? row.responsable_display : null,
        done: Boolean(row.done),
        done_at: typeof row.done_at === "string" ? row.done_at : null,
        predefined: Boolean(row.predefined),
      } satisfies BacklogItem;
    })
    .filter((item): item is BacklogItem => item !== null);
}

export function seedBacklogIfEmpty(items: BacklogItem[]): BacklogItem[] {
  if (items.length > 0) return items;
  return emptyBacklogFromTemplate();
}

/** Reemplaza el backlog con la plantilla predefinida (29 tareas). */
export function backlogFromTemplate(): BacklogItem[] {
  return emptyBacklogFromTemplate();
}
