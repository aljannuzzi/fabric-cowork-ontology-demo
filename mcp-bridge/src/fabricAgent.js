import { randomUUID } from "node:crypto";

// All Fabric coordinates come from environment variables so that no tenant-specific
// or internal endpoint is baked into the source.
const HOST = process.env.FABRIC_HOST;
const CAPACITY = process.env.FABRIC_CAPACITY_ID;
const WORKSPACE = process.env.FABRIC_WORKSPACE_ID;
const ARTIFACT = process.env.FABRIC_ARTIFACT_ID;
const STAGE = process.env.FABRIC_STAGE || "sandbox";
const API = "?api-version=2024-05-01-preview";

function baseUrl() {
  return `${HOST}/webapi/capacities/${CAPACITY}/workloads/ML/AISkill/Automatic/v1` +
    `/workspaces/${WORKSPACE}/artifacts/${ARTIFACT}/aiassistant/openai`;
}

function headers(token, moniker) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
    ActivityId: randomUUID(),
    "x-ms-workload-resource-moniker": moniker,
    "x-ms-ai-assistant-scenario": "aiskill",
    "x-ms-ai-aiskill-stage": STAGE,
    "X-Taxonomy-TrafficType": "Production",
    "x-llm-service-tier": "default"
  };
}

async function call(token, moniker, path, method = "GET", body) {
  const r = await fetch(baseUrl() + path + API, {
    method,
    headers: headers(token, moniker),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 500);
  }
  if (r.status >= 400) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`Fabric ${method} ${path} -> ${r.status}: ${detail.slice(0, 400)}`);
  }
  return parsed;
}

let cachedAssistant = null;

async function getAssistantId(token, moniker) {
  if (cachedAssistant) return cachedAssistant;
  const a = await call(token, moniker, "/assistants", "POST", { model: "not used" });
  cachedAssistant = a.id;
  return cachedAssistant;
}

export async function askDataAgent(token, question, { timeoutMs = 180000 } = {}) {
  if (!HOST || !CAPACITY || !WORKSPACE || !ARTIFACT) {
    throw new Error("FABRIC_HOST, FABRIC_CAPACITY_ID, FABRIC_WORKSPACE_ID and FABRIC_ARTIFACT_ID must be set.");
  }

  const started = Date.now();
  const moniker = randomUUID();

  // The assistant is stateless and reusable; creating one per question costs a
  // full round-trip for no benefit. Cache it and create the thread in parallel.
  const [assistantId, thread] = await Promise.all([
    getAssistantId(token, moniker),
    call(token, moniker, "/threads", "POST", {})
  ]);

  await call(token, moniker, `/threads/${thread.id}/messages`, "POST", {
    role: "user",
    content: question
  });

  let run = await call(token, moniker, `/threads/${thread.id}/runs`, "POST", {
    assistant_id: assistantId
  });

  const deadline = started + timeoutMs;
  const terminal = new Set(["completed", "failed", "cancelled", "expired"]);

  // Backoff: poll fast early (most runs finish in 20-60s), then ease off.
  let wait = 1000;
  while (!terminal.has(run.status)) {
    if (Date.now() > deadline) {
      throw new Error(`Data Agent timed out after ${timeoutMs}ms (last status: ${run.status})`);
    }
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(Math.round(wait * 1.35), 5000);
    run = await call(token, moniker, `/threads/${thread.id}/runs/${run.id}`);
  }

  if (run.status !== "completed") {
    const err = run.last_error ? JSON.stringify(run.last_error) : run.status;
    throw new Error(`Data Agent run ${run.status}: ${err}`);
  }

  const msgs = await call(token, moniker, `/threads/${thread.id}/messages`);
  const answers = (msgs?.data ?? [])
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (m.content ?? []).map((c) => c?.text?.value).filter(Boolean));

  return {
    answer: answers.join("\n\n"),
    threadId: thread.id,
    runId: run.id,
    elapsedMs: Date.now() - started
  };
}
