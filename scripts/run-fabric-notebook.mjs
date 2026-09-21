import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const TENANT = "<TENANT_ID>";
const WS = "<WORKSPACE_ID>";
const LH = "<LAKEHOUSE_ID>";
const NAME = "NovaTelSpy1";

import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const py = fs.readFileSync(path.join(dir, "agent-test.py"), "utf8");

function token(resource) {
  return execSync(`az account get-access-token --tenant ${TENANT} --resource ${resource} --query accessToken -o tsv`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  }).trim();
}

const fabricToken = token("https://api.fabric.microsoft.com");
const H = { Authorization: `Bearer ${fabricToken}`, "Content-Type": "application/json" };

const ipynb = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    language_info: { name: "python" },
    dependencies: {
      lakehouse: { default_lakehouse: LH, default_lakehouse_workspace_id: WS }
    }
  },
  cells: [
    {
      cell_type: "code",
      source: py.split("\n").map((l, i, a) => (i === a.length - 1 ? l : l + "\n")),
      metadata: {},
      execution_count: null,
      outputs: []
    }
  ]
};

async function api(url, options = {}) {
  const r = await fetch(url, { headers: H, ...options });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body, headers: r.headers };
}

// 1. remove notebook anterior, se houver
const items = await api(`https://api.fabric.microsoft.com/v1/workspaces/${WS}/items`);
for (const it of (items.body?.value ?? [])) {
  if (it.displayName === NAME) {
    await api(`https://api.fabric.microsoft.com/v1/workspaces/${WS}/items/${it.id}`, { method: "DELETE" });
    console.log("notebook anterior removido");
  }
}

// 2. cria notebook
const create = await api(`https://api.fabric.microsoft.com/v1/workspaces/${WS}/notebooks`, {
  method: "POST",
  body: JSON.stringify({
    displayName: NAME,
    definition: {
      format: "ipynb",
      parts: [
        {
          path: "notebook-content.ipynb",
          payload: Buffer.from(JSON.stringify(ipynb), "utf8").toString("base64"),
          payloadType: "InlineBase64"
        }
      ]
    }
  })
});
console.log("criar notebook:", create.status);

let nbId = create.body?.id;
if (!nbId) {
  await new Promise((r) => setTimeout(r, 30000));
  const again = await api(`https://api.fabric.microsoft.com/v1/workspaces/${WS}/items?type=Notebook`);
  nbId = (again.body?.value ?? []).find((n) => n.displayName === NAME)?.id;
}
console.log("notebookId:", nbId);
if (!nbId) { console.log(JSON.stringify(create.body).slice(0, 800)); process.exit(1); }

// 3. dispara execucao
const run = await api(
  `https://api.fabric.microsoft.com/v1/workspaces/${WS}/items/${nbId}/jobs/instances?jobType=RunNotebook`,
  { method: "POST", body: JSON.stringify({ executionData: {} }) }
);
console.log("disparar job:", run.status);
const loc = run.headers.get("location");
console.log("location:", loc);

// 4. aguarda
let status = "NotStarted";
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const s = await api(loc);
  status = s.body?.status ?? "?";
  console.log(`[${(i + 1) * 15}s] ${status}`);
  if (["Completed", "Failed", "Cancelled", "Deduped"].includes(status)) {
    if (s.body?.failureReason) console.log("motivo:", JSON.stringify(s.body.failureReason).slice(0, 900));
    break;
  }
}

// 5. le a resposta do OneLake
const storageToken = token("https://storage.azure.com");
const r = await fetch(
  `https://onelake.dfs.fabric.microsoft.com/${WS}/${LH}/Files/agent-answer.json`,
  { headers: { Authorization: `Bearer ${storageToken}`, "x-ms-version": "2021-10-04" } }
);
console.log("\n=== agent-answer.json (HTTP " + r.status + ") ===");
console.log((await r.text()).slice(0, 6000));

















