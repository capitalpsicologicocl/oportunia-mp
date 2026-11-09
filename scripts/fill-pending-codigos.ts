import { createServiceClient } from "../src/lib/supabase/server";
import { DEFAULT_ORG_ID } from "../src/types/database";
import { PENDING_MP_HASH, importProcessByCodigo } from "../src/lib/ingest/service";

async function main() {
  process.env.MP_FETCH_TIMEOUT_MS = process.env.MP_FETCH_TIMEOUT_MS ?? "20000";
  const extra = process.argv.slice(2).map((c) => c.trim()).filter(Boolean);
  const supabase = createServiceClient();
  const { data: pending } = await supabase
    .from("processes")
    .select("codigo_externo")
    .eq("organization_id", DEFAULT_ORG_ID)
    .eq("content_hash", PENDING_MP_HASH);

  const codes = [...new Set([...(pending ?? []).map((r) => r.codigo_externo as string), ...extra])];
  console.log("Pendientes:", codes.join(", ") || "(ninguno)");

  for (const codigo of codes) {
    const result = await importProcessByCodigo(codigo, {
      force: true,
      queueIfMissing: true,
      fast: false,
      timeoutMs: 20_000,
    });
    console.log(codigo, result);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
