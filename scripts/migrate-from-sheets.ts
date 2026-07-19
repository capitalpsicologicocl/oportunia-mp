#!/usr/bin/env tsx
/**
 * Migra datos desde CSV exportados de Google Sheets hacia Supabase.
 * Uso: npm run migrate:sheets
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { parseMontoFromSheet } from "../src/lib/montos";
import { computeContentHash } from "../src/lib/content-hash";
import { DEFAULT_ORG_ID, type Postulabilidad } from "../src/types/database";

const MIGRATION_DIR = join(process.cwd(), "data/migration");

const LICITACIONES_FILE = join(
  MIGRATION_DIR,
  "OportunIA MP v.008 - Licitaciones (1).csv"
);
const COMPRAS_FILE = join(MIGRATION_DIR, "OportunIA MP v.008 - Compras Ágiles.csv");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "No especificado") return null;
  return trimmed;
}

function parseSheetDate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = "12", min = "00"] = match;
  return new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00.000Z`).toISOString();
}

function mapPostulabilidad(value: string | undefined): Postulabilidad {
  const v = value?.trim() ?? "";
  if (v.includes("✅") || v.toLowerCase().includes("sí") || v.toLowerCase().includes("si")) {
    return "alta";
  }
  if (v.includes("⚠️") || v.toLowerCase().includes("revisar")) return "revisar";
  if (v.includes("❌") || v.toLowerCase().includes("no")) return "no_aplica";
  return "pendiente";
}

function parseNumItems(detalle: string | null): number | null {
  if (!detalle) return null;
  const match = detalle.match(/\(\+(\d+) más\)/);
  if (match) return 5 + Number(match[1]);
  const count = detalle.split(";").filter(Boolean).length;
  return count || null;
}

interface MigrationReport {
  licitaciones: number;
  comprasAgiles: number;
  montosSospechosos: number;
  montosCorregidos: number;
  errores: string[];
}

async function migrate() {
  if (!existsSync(LICITACIONES_FILE)) {
    throw new Error(`No se encontró: ${LICITACIONES_FILE}`);
  }
  if (!existsSync(COMPRAS_FILE)) {
    throw new Error(`No se encontró: ${COMPRAS_FILE}`);
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const report: MigrationReport = {
    licitaciones: 0,
    comprasAgiles: 0,
    montosSospechosos: 0,
    montosCorregidos: 0,
    errores: [],
  };

  const licRows = parse(readFileSync(LICITACIONES_FILE, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  for (const row of licRows) {
    try {
      const codigo = row["Código"]?.trim();
      if (!codigo) continue;

      const montoSheet = parseMontoFromSheet(row["Monto estimado"]);
      if (montoSheet.suspicious) report.montosSospechosos += 1;

      const nombre = row["Nombre"]?.trim() ?? codigo;
      const detalle = emptyToNull(row["Detalle de ítems"]);

      const processRow = {
        organization_id: DEFAULT_ORG_ID,
        codigo_externo: codigo,
        tipo: "licitacion" as const,
        estado: emptyToNull(row["Estado MP"]),
        nombre,
        tipo_detalle: emptyToNull(row["Tipo"]),
        monto_estimado: montoSheet.value,
        monto_raw_api: montoSheet.raw || null,
        monto_sospechoso: montoSheet.suspicious,
        organismo_nombre: emptyToNull(row["Organismo"]),
        lugar_ejecucion: emptyToNull(row["Región / Ciudad"]),
        fecha_publicacion: parseSheetDate(row["Fecha publicación"]),
        fecha_cierre: parseSheetDate(row["Fecha cierre"]),
        hora_cierre: emptyToNull(row["Hora cierre"]),
        dias_para_cierre: row["Días para cierre"] ? Number(row["Días para cierre"]) : null,
        url_publica: emptyToNull(row["URL"]),
        servicios_requeridos: detalle,
        num_items: parseNumItems(detalle),
        num_personas: emptyToNull(row["N° de personas"]),
        modalidad_texto: emptyToNull(row["Modalidad"]),
        fechas_ejecucion: emptyToNull(row["Fechas de ejecución"]),
        requiere_arrendar_lugar: emptyToNull(row["Requiere arrendar lugar"]),
        coffee: emptyToNull(row["Coffee"]),
        almuerzo: emptyToNull(row["Almuerzo"]),
        permite_consorcio: emptyToNull(row["Permite consorcio"]),
        plazo_preguntas: emptyToNull(row["Plazo preguntas/aclaraciones"]),
        garantia_seriedad: emptyToNull(row["Garantía seriedad de oferta"]),
        garantia_fiel_cumplimiento: emptyToNull(row["Garantía fiel cumplimiento"]),
        content_hash: computeContentHash([nombre, detalle, row["Estado MP"], montoSheet.raw]),
        last_synced_at: parseSheetDate(row["Fecha consulta"]),
      };

      const { data: process, error } = await supabase
        .from("processes")
        .upsert(processRow, { onConflict: "organization_id,codigo_externo" })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      const postulabilidad = mapPostulabilidad(row["¿Es postulable?"]);
      await supabase.from("ai_evaluations").upsert(
        {
          process_id: process.id,
          postulabilidad,
          content_hash: processRow.content_hash,
          razonamiento: "Importado desde Google Sheets",
        },
        { onConflict: "process_id" }
      );

      const montoOfertado = parseMontoFromSheet(row["Monto ofertado"]);
      await supabase.from("kanban_cards").upsert(
        {
          organization_id: DEFAULT_ORG_ID,
          process_id: process.id,
          estado_interno: emptyToNull(row["Estado interno"]),
          responsable: emptyToNull(row["Responsable"]),
          fecha_postulacion: parseSheetDate(row["Fecha postulación"])?.slice(0, 10) ?? null,
          monto_ofertado: montoOfertado.value,
          observaciones: emptyToNull(row["Observaciones"]),
        },
        { onConflict: "process_id" }
      );

      report.licitaciones += 1;
    } catch (err) {
      report.errores.push(`Licitación ${row["Código"]}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const caRows = parse(readFileSync(COMPRAS_FILE, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  for (const row of caRows) {
    try {
      const codigo = row["Código COT"]?.trim();
      if (!codigo) continue;

      const montoSheet = parseMontoFromSheet(row["Monto disponible"]);
      if (montoSheet.suspicious) {
        report.montosSospechosos += 1;
        report.montosCorregidos += 1;
      }

      const nombre = row["Nombre"]?.trim() ?? codigo;
      const productos = emptyToNull(row["Productos solicitados"]);

      const processRow = {
        organization_id: DEFAULT_ORG_ID,
        codigo_externo: codigo,
        tipo: "compra_agil" as const,
        estado: emptyToNull(row["Estado MP"]),
        nombre,
        tipo_detalle: "Compra Ágil",
        monto_estimado: montoSheet.value,
        monto_raw_api: montoSheet.raw || null,
        monto_sospechoso: montoSheet.suspicious,
        organismo_nombre: emptyToNull(row["Organismo"]),
        unidad_compra: emptyToNull(row["Unidad"]),
        fecha_publicacion: parseSheetDate(row["Fecha publicación"]),
        fecha_cierre: parseSheetDate(row["Fecha cierre 1er llamado"]),
        fecha_cierre_2: parseSheetDate(row["Fecha cierre 2do llamado"]),
        hora_cierre: emptyToNull(row["Hora cierre 1er llamado"]),
        hora_cierre_2: emptyToNull(row["Hora cierre 2do llamado"]),
        dias_para_cierre: row["Días para cierre"] ? Number(row["Días para cierre"]) : null,
        url_publica: emptyToNull(row["URL"]),
        servicios_requeridos: productos,
        num_personas: emptyToNull(row["N° de personas"]),
        modalidad_texto: emptyToNull(row["Modalidad"]),
        fechas_ejecucion: emptyToNull(row["Fechas de ejecución"]),
        requiere_arrendar_lugar: emptyToNull(row["Requiere arrendar lugar"]),
        coffee: emptyToNull(row["Coffee"]),
        almuerzo: emptyToNull(row["Almuerzo"]),
        content_hash: computeContentHash([nombre, productos, row["Estado MP"], montoSheet.raw]),
        last_synced_at: parseSheetDate(row["Fecha consulta"]),
      };

      const { data: process, error } = await supabase
        .from("processes")
        .upsert(processRow, { onConflict: "organization_id,codigo_externo" })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      const postulabilidad = mapPostulabilidad(row["¿Es postulable?"]);
      await supabase.from("ai_evaluations").upsert(
        {
          process_id: process.id,
          postulabilidad,
          content_hash: processRow.content_hash,
          razonamiento: "Importado desde Google Sheets",
        },
        { onConflict: "process_id" }
      );

      const montoOfertado = parseMontoFromSheet(row["Monto ofertado"]);
      await supabase.from("kanban_cards").upsert(
        {
          organization_id: DEFAULT_ORG_ID,
          process_id: process.id,
          estado_interno: emptyToNull(row["Estado interno"]),
          responsable: emptyToNull(row["Responsable"]),
          fecha_postulacion: parseSheetDate(row["Fecha postulación"])?.slice(0, 10) ?? null,
          monto_ofertado: montoOfertado.value,
          observaciones: emptyToNull(row["Observaciones"]),
        },
        { onConflict: "process_id" }
      );

      report.comprasAgiles += 1;
    } catch (err) {
      report.errores.push(`Compra Ágil ${row["Código COT"]}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n=== Reporte de migración ===");
  console.log(`Licitaciones importadas:    ${report.licitaciones}`);
  console.log(`Compras Ágiles importadas:  ${report.comprasAgiles}`);
  console.log(`Montos sospechosos:         ${report.montosSospechosos}`);
  console.log(`Montos corregidos (heur.):  ${report.montosCorregidos}`);
  console.log(`Errores:                    ${report.errores.length}`);
  if (report.errores.length) {
    console.log("\nPrimeros 10 errores:");
    report.errores.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
  }
}

migrate().catch((err) => {
  console.error("Migración fallida:", err.message);
  process.exit(1);
});
