import { runFastManualSync } from "../src/lib/ingest/service";

async function main() {
  const result = await runFastManualSync("compra_agil", { continueBatch: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
