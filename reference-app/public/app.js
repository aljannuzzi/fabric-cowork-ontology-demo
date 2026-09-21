async function loadOntology() {
  const ontology = await fetch("/api/ontology").then((response) => response.json());
  const svg = document.querySelector("#graph");
  const nodeById = Object.fromEntries(ontology.nodes.map((node) => [node.id, node]));

  for (const edge of ontology.edges) {
    const from = nodeById[edge.from];
    const to = nodeById[edge.to];
    svg.insertAdjacentHTML("beforeend", `
      <line class="edge" x1="${from.x + 72}" y1="${from.y}" x2="${to.x - 72}" y2="${to.y}" />
      <text class="verb" x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 8}">${edge.verb}</text>
    `);
  }

  for (const node of ontology.nodes) {
    svg.insertAdjacentHTML("beforeend", `
      <g>
        <rect class="node" x="${node.x - 82}" y="${node.y - 38}" width="164" height="76" rx="18" />
        <text class="label" x="${node.x}" y="${node.y - 4}">${node.label}</text>
        <text class="table" x="${node.x}" y="${node.y + 19}">${node.table}</text>
      </g>
    `);
  }
}

async function runDemo() {
  const answer = document.querySelector("#answer");
  answer.textContent = "Cowork is reading the email context, invoking the MCP skill, and asking the ontology gatekeeper...";
  const response = await fetch("/api/cowork/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ emailText: document.querySelector("#emailText").value })
  });
  const result = await response.json();
  answer.textContent = `${result.draftReply}\n\nOntology path: ${result.dataAgentBrief.ontologyPath.join(" -> ")}\n\nMetrics:\n${JSON.stringify(result.dataAgentBrief.metrics, null, 2)}`;
}

document.querySelector("#runDemo").addEventListener("click", runDemo);
loadOntology();
