import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TENANT = "<TENANT_ID>";
const HOST = "https://<FABRIC_WORKLOAD_HOST>";
const CAPACITY = "<CAPACITY_ID>";
const WS = "<WORKSPACE_ID>";
const ARTIFACT = "<DATA_AGENT_ID>";

const BASE = `${HOST}/webapi/capacities/${CAPACITY}/workloads/ML/AISkill/Automatic/v1` +
  `/workspaces/${WS}/artifacts/${ARTIFACT}/aiassistant/openai`;

const token = execSync(
  `az account get-access-token --tenant ${TENANT} --resource https://analysis.windows.net/powerbi/api --query accessToken -o tsv`,
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
).trim();

const MONIKER = randomUUID();

function headers() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
    ActivityId: randomUUID(),
    "x-ms-workload-resource-moniker": MONIKER,
    "x-ms-ai-assistant-scenario": "aiskill",
    "x-ms-ai-aiskill-stage": "sandbox",
    "X-Taxonomy-TrafficType": "Production",
    "x-llm-service-tier": "default"
  };
}

const API = "?api-version=2024-05-01-preview";

async function call(path, method = "GET", body) {
  const r = await fetch(BASE + path + API, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
  return { status: r.status, body: parsed };
}

const question = process.argv[2] ||
  "What is the renewal risk for Contoso Mobile? Explain using the ontology.";

console.log("1. assistant...");
const a = await call("/assistants", "POST", { model: "not used" });
console.log("   ", a.status, a.status >= 400 ? JSON.stringify(a.body).slice(0, 300) : a.body.id);
if (a.status >= 400) process.exit(1);

console.log("2. thread...");
const t = await call("/threads", "POST", {});
console.log("   ", t.status, t.body.id);

console.log("3. message...");
const m = await call(`/threads/${t.body.id}/messages`, "POST", { role: "user", content: question });
console.log("   ", m.status);

console.log("4. run...");
const run = await call(`/threads/${t.body.id}/runs`, "POST", { assistant_id: a.body.id });
console.log("   ", run.status, run.body?.status);

let st = run.body?.status;
for (let i = 0; i < 40 && !["completed", "failed", "cancelled", "expired"].includes(st); i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const p = await call(`/threads/${t.body.id}/runs/${run.body.id}`);
  st = p.body?.status;
  if (i % 2 === 0) console.log(`   [${(i + 1) * 5}s] ${st}`);
  if (st === "failed") console.log("   erro:", JSON.stringify(p.body?.last_error).slice(0, 300));
}

const msgs = await call(`/threads/${t.body.id}/messages`);
const answers = (msgs.body?.data ?? [])
  .filter((x) => x.role === "assistant")
  .flatMap((x) => (x.content ?? []).map((c) => c?.text?.value ?? ""));

console.log("\n=== RESPOSTA EXTERNA ===");
console.log(answers.join("\n---\n").slice(0, 2500));
