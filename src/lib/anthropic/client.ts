import Anthropic from "@anthropic-ai/sdk";
import type { ApiKeyStatus } from "@/types/database";

/** Haiku 4.5 — modelo económico actual (jul 2026). Override con ANTHROPIC_MODEL en .env */
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

export async function validateAnthropicKey(apiKey: string): Promise<{
  valid: boolean;
  status: ApiKeyStatus;
  message: string;
}> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 10,
      messages: [{ role: "user", content: "ok" }],
    });
    return { valid: true, status: "valid", message: "API key válida" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const lower = message.toLowerCase();

    if (lower.includes("not_found_error") || lower.includes("model:")) {
      return {
        valid: false,
        status: "invalid",
        message: `Modelo no disponible (${ANTHROPIC_MODEL}). Contacta al administrador.`,
      };
    }
    if (lower.includes("credit") || lower.includes("balance") || lower.includes("billing")) {
      return { valid: false, status: "no_credits", message: "Sin crédito en la cuenta Anthropic" };
    }
    if (lower.includes("authentication") || lower.includes("invalid") || lower.includes("401")) {
      return { valid: false, status: "invalid", message: "API key inválida" };
    }
    if (lower.includes("expired")) {
      return { valid: false, status: "expired", message: "API key expirada" };
    }

    return { valid: false, status: "invalid", message: `Error al validar: ${message}` };
  }
}

export async function callClaudeWithOrgKey(
  apiKey: string,
  prompt: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type === "text") return block.text;
  return "";
}
