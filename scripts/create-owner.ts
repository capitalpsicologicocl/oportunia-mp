/**
 * Crea el usuario principal (owner) si aún no hay usuarios.
 * Uso: npm run create-owner -- --rut=12345678-9 --password=miClave --nombre="Claudio"
 */
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";
import { parseRutInput } from "../src/lib/auth/rut";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const rutInput = arg("rut");
  const password = arg("password");
  const nombre = arg("nombre") ?? "Administrador";

  if (!rutInput || !password) {
    console.error("Uso: npm run create-owner -- --rut=12345678-9 --password=tuClave [--nombre=Tu Nombre]");
    process.exit(1);
  }

  const parsed = parseRutInput(rutInput);
  if (!parsed) {
    console.error("RUT inválido");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { count } = await supabase
    .from("org_users")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", DEFAULT_ORG_ID);

  if ((count ?? 0) > 0) {
    console.error("Ya existen usuarios. Si olvidaste la clave, borra filas en org_users o usa Ajustes (owner).");
    process.exit(1);
  }

  const { error } = await supabase.from("org_users").insert({
    organization_id: DEFAULT_ORG_ID,
    rut: parsed.rut,
    rut_dv: parsed.rut_dv,
    nombre,
    password_hash: hashPassword(password),
    role: "owner",
  });

  if (error) {
    console.error("Error:", error.message);
    if (error.message.includes("org_users")) {
      console.error("Ejecuta primero la migración 20260316400000_auth_users_org_fields.sql en Supabase.");
    }
    process.exit(1);
  }

  console.log("Usuario principal creado.");
  console.log(`Ingresa en /login con RUT ${parsed.rut}-${parsed.rut_dv} y tu clave.`);
}

main();
