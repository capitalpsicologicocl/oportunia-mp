import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_ID } from "@/types/database";

const WORKFLOW_FILE = "sync-compra-agil.yml";

export function githubRepoFromEnv(): { owner: string; repo: string } {
  const explicit = process.env.GITHUB_REPO?.trim();
  if (explicit?.includes("/")) {
    const [owner, repo] = explicit.split("/");
    return { owner, repo };
  }
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const repo = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  if (owner && repo) return { owner, repo };
  return { owner: "capitalpsicologicocl", repo: "oportunia-mp" };
}

async function githubApi(
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: unknown }> {
  const token = process.env.GITHUB_SYNC_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Falta GITHUB_SYNC_TOKEN en Vercel (PAT con permiso Actions: write) para disparar la sync larga."
    );
  }
  const { owner, repo } = githubRepoFromEnv();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }
  return { status: response.status, json };
}

export async function markCaSyncQueued(source: "github_queued" | "github_running"): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  await supabase
    .from("org_settings")
    .update({
      last_cron_attempt_at: now,
      last_cron_error: null,
      last_cron_summary: {
        partial: true,
        created: 0,
        updated: 0,
        archived: 0,
        cronCaPasses: 0,
        mpError: null,
        at: now,
        source,
      },
      updated_at: now,
    })
    .eq("organization_id", DEFAULT_ORG_ID);
}

export async function triggerCompraAgilGithubSync(): Promise<{
  queued: boolean;
  alreadyRunning: boolean;
}> {
  const { status: listStatus, json: listJson } = await githubApi(
    `/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`
  );
  if (listStatus === 404) {
    throw new Error(
      "No está el workflow sync-compra-agil.yml en GitHub. Haz push de main e inténtalo de nuevo."
    );
  }
  if (listStatus >= 400) {
    const message =
      typeof listJson === "object" && listJson && "message" in listJson
        ? String((listJson as { message: string }).message)
        : `GitHub HTTP ${listStatus}`;
    throw new Error(`No pude consultar Actions: ${message}`);
  }

  const runs = (listJson as { workflow_runs?: Array<{ status: string }> }).workflow_runs ?? [];
  const alreadyRunning = runs.some((run) => run.status === "queued" || run.status === "in_progress");
  if (alreadyRunning) {
    await markCaSyncQueued("github_running");
    return { queued: true, alreadyRunning: true };
  }

  const { owner, repo } = githubRepoFromEnv();
  const { status, json } = await githubApi(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: process.env.GITHUB_SYNC_REF?.trim() || "main" }),
  });

  if (status !== 204 && status !== 200) {
    const message =
      typeof json === "object" && json && "message" in json
        ? String((json as { message: string }).message)
        : `GitHub HTTP ${status}`;
    throw new Error(
      `No pude disparar la sync en GitHub (${owner}/${repo}): ${message}`
    );
  }

  await markCaSyncQueued("github_queued");
  return { queued: true, alreadyRunning: false };
}
