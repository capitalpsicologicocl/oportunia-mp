import { createHash } from "crypto";

export function computeContentHash(parts: (string | null | undefined)[]): string {
  const payload = parts.map((p) => (p ?? "").trim()).join("|");
  return createHash("sha256").update(payload).digest("hex");
}
