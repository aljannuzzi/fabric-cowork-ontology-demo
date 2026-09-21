import express from "express";
import { askDataAgent } from "./fabricAgent.js";
import { getFabricToken, authMode } from "./auth.js";

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));

const TOOLS = [
  {
    name: "customer_intelligence",
    title: "NovaTel customer intelligence",
    description:
      "Ask the NovaTel Fabric Data Agent a natural-language question about an enterprise telco " +
      "customer account. The Data Agent is grounded in the NovaTel Fabric IQ ontology " +
      "(Customer, Subscription, Product, Usage, Experience, RenewalRisk) and queries live OneLake " +
      "data. Use for renewal risk, churn, ARR, revenue exposure, subscriptions, product usage, " +
      "consumption trends, support tickets, SLA breaches, NPS and overall account health.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "The business question in natural language, e.g. 'What is the renewal risk for " +
            "Contoso Mobile and why?'. Include the customer name when known."
        }
      },
      required: ["question"]
    }
  },
  {
    name: "describe_ontology",
    title: "Describe the NovaTel ontology",
    description:
      "Return the NovaTel Fabric IQ ontology: business entities, their physical tables and the " +
      "relationships that connect them. Use to explain how the business graph is structured.",
    inputSchema: { type: "object", properties: {} }
  }
];

const ONTOLOGY = {
  name: "NovaTelOntologyV2",
  entities: [
    { entity: "Customer", table: "customers", meaning: "A NovaTel enterprise account." },
    { entity: "Product", table: "products", meaning: "A commercial offer with category and margin band." },
    { entity: "Subscription", table: "subscriptions", meaning: "Customer-to-product relationship carrying seats and ARR." },
    { entity: "Usage", table: "usage_metrics", meaning: "Monthly consumption and network-quality signals." },
    { entity: "Experience", table: "support_tickets", meaning: "Tickets, severity and SLA breaches." },
    { entity: "RenewalRisk", table: "renewals", meaning: "Renewal timing, stage and NPS." }
  ],
  relationships: [
    "Customer -owns-> Subscription",
    "Subscription -contains-> Product",
    "Subscription -generates-> Usage",
    "Usage -affects-> Experience",
    "Experience -increases-> RenewalRisk",
    "Customer -reports-> Experience",
    "Customer -faces-> RenewalRisk"
  ]
};

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function fail(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolResult(id, payload, isError = false) {
  return ok(id, {
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
    structuredContent: typeof payload === "string" ? { text: payload } : payload,
    isError
  });
}

async function handle(message, authHeader) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return fail(message?.id, -32600, "Invalid JSON-RPC 2.0 request");
  }

  switch (message.method) {
    case "initialize":
      return ok(message.id, {
        protocolVersion: ["2025-06-18", "2025-03-26", "2024-11-05"].includes(message.params?.protocolVersion)
          ? message.params.protocolVersion
          : "2025-06-18",
        serverInfo: { name: "novatel-fabric-agent", title: "NovaTel Customer Intelligence", version: "1.0.0" },
        capabilities: { tools: { listChanged: false } },
        instructions:
          "Gateway to NovaTel enterprise customer data in Microsoft Fabric. Call customer_intelligence " +
          "for any question about a customer account. The answer comes from a Fabric Data Agent grounded " +
          "in the Fabric IQ ontology; relay its ontology path and figures verbatim and never invent numbers."
      });

    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/progress":
      return null;

    case "ping":
      return ok(message.id, {});

    case "tools/list":
      return ok(message.id, { tools: TOOLS });

    case "resources/list":
      return ok(message.id, { resources: [] });

    case "prompts/list":
      return ok(message.id, { prompts: [] });

    case "tools/call": {
      const { name, arguments: args = {} } = message.params ?? {};

      if (name === "describe_ontology") {
        return toolResult(message.id, ONTOLOGY);
      }

      if (name === "customer_intelligence") {
        const question = (args.question || "").trim();
        if (!question) return toolResult(message.id, "A 'question' argument is required.", true);
        try {
          const token = await getFabricToken(authHeader);
          const r = await askDataAgent(token, question);
          return toolResult(message.id, {
            answer: r.answer,
            source: "Microsoft Fabric Data Agent (NovaTelDataAgent), grounded in Fabric IQ ontology",
            threadId: r.threadId
          });
        } catch (e) {
          return toolResult(message.id, `Fabric Data Agent error: ${e.message}`, true);
        }
      }

      return fail(message.id, -32602, `Unknown tool: ${name}`);
    }

    default:
      if (message.id === undefined) return null;
      return fail(message.id, -32601, `Unknown method: ${message.method}`);
  }
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    auth: authMode(),
    fabric: {
      capacity: Boolean(process.env.FABRIC_CAPACITY_ID),
      workspace: Boolean(process.env.FABRIC_WORKSPACE_ID),
      artifact: Boolean(process.env.FABRIC_ARTIFACT_ID)
    }
  });
});

app.post("/mcp", async (req, res, next) => {
  try {
    res.setHeader("Mcp-Session-Id", "novatel-fabric-agent");
    const auth = req.headers.authorization;

    if (Array.isArray(req.body)) {
      const out = [];
      for (const m of req.body) {
        const r = await handle(m, auth);
        if (r) out.push(r);
      }
      return out.length ? res.json(out) : res.status(202).end();
    }

    const r = await handle(req.body, auth);
    return r ? res.json(r) : res.status(202).end();
  } catch (e) {
    next(e);
  }
});

app.get("/mcp", (req, res) => {
  res.status(405).json(fail(null, -32000, "Use POST for JSON-RPC. Server-initiated streams are not supported."));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json(fail(null, -32603, err.message));
});

app.listen(port, () => console.log(`NovaTel MCP listening on ${port} (auth=${authMode()})`));
