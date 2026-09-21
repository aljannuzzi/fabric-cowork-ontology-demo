import { buildCustomerRiskBrief, answerBossEmail, listCustomers } from "./dataAgent.js";
import { ontology } from "./ontology.js";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

const tools = [
  {
    name: "customer_risk_brief",
    title: "Customer renewal-risk brief",
    description:
      "Ask the Fabric ontology gatekeeper for a renewal-risk brief about one customer. " +
      "The Data Agent walks the ontology (Customer -> Subscription -> Product -> Usage -> Experience -> Renewal Risk) " +
      "and returns risk level, revenue exposure, usage trend, support evidence, and a recommended action.",
    inputSchema: {
      type: "object",
      properties: {
        customerName: {
          type: "string",
          description: "Customer name, for example 'Contoso Mobile'."
        }
      },
      required: ["customerName"]
    }
  },
  {
    name: "answer_boss_email",
    title: "Answer a business question from an email",
    description:
      "Given the text of an email or business request, identify which customer it is about, " +
      "retrieve the ontology-grounded evidence, and return a draft executive reply. " +
      "Use this when an email asks about customer risk, renewals, churn, or account health.",
    inputSchema: {
      type: "object",
      properties: {
        emailText: {
          type: "string",
          description: "The full text of the email or business request."
        }
      },
      required: ["emailText"]
    }
  },
  {
    name: "list_customers",
    title: "List customers in the ontology",
    description: "List every customer known to the ontology, with segment, industry, and account manager.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "describe_ontology",
    title: "Describe the ontology model",
    description:
      "Return the ontology entities, their relationships, and the semantic mappings to physical tables. " +
      "Use this to explain how the business graph is structured before querying it.",
    inputSchema: { type: "object", properties: {} }
  }
];

export function isNotification(message) {
  return Boolean(message) && typeof message === "object" && message.id === undefined;
}

export async function handleMcpRequest(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request");
  }

  if (message.jsonrpc !== "2.0") {
    return jsonRpcError(message.id ?? null, -32600, "Only JSON-RPC 2.0 is supported");
  }

  const notification = isNotification(message);

  try {
    switch (message.method) {
      case "initialize": {
        const requested = message.params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : DEFAULT_PROTOCOL_VERSION;

        return ok(message.id, {
          protocolVersion,
          serverInfo: {
            name: "fabric-ontology-agent",
            title: "Fabric Customer Intelligence",
            version: "1.0.0"
          },
          capabilities: { tools: { listChanged: false } },
          instructions:
            "This server is the gatekeeper for NovaTel Enterprise business data in Microsoft Fabric. " +
            "Call describe_ontology to understand the business graph, list_customers to discover accounts, " +
            "and customer_risk_brief or answer_boss_email to retrieve ontology-grounded answers. " +
            "Never assume business facts that these tools did not return."
        });
      }

      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
        return null;

      case "ping":
        return ok(message.id, {});

      case "tools/list":
        return ok(message.id, { tools });

      case "tools/call":
        return await callTool(message);

      case "resources/list":
        return ok(message.id, { resources: [] });

      case "prompts/list":
        return ok(message.id, { prompts: [] });

      default:
        if (notification) {
          return null;
        }
        return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    if (notification) {
      return null;
    }
    return jsonRpcError(message.id, -32603, error.message);
  }
}

async function callTool(message) {
  const { name, arguments: args = {} } = message.params ?? {};

  switch (name) {
    case "customer_risk_brief": {
      const result = await buildCustomerRiskBrief(args.customerName ?? "Contoso Mobile");
      return toolResult(message.id, result, !result.found);
    }
    case "answer_boss_email": {
      const result = await answerBossEmail(args.emailText ?? "");
      return toolResult(message.id, result, false);
    }
    case "list_customers": {
      const result = await listCustomers();
      return toolResult(message.id, { customers: result }, false);
    }
    case "describe_ontology": {
      return toolResult(
        message.id,
        {
          name: ontology.name,
          description: ontology.description,
          entities: ontology.nodes.map((node) => ({ entity: node.label, table: node.table })),
          relationships: ontology.edges.map((edge) => `${edge.from} ${edge.verb} ${edge.to}`),
          semanticMappings: ontology.semanticMappings
        },
        false
      );
    }
    default:
      return jsonRpcError(message.id, -32602, `Unknown tool: ${name}`);
  }
}

function toolResult(id, result, isError) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
      isError: Boolean(isError)
    }
  };
}

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
