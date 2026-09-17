import { buildCustomerRiskBrief, answerBossEmail } from "./dataAgent.js";

const tools = [
  {
    name: "customer_risk_brief",
    description: "Use the Fabric IQ ontology to produce a customer renewal-risk brief.",
    inputSchema: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Customer name, for example Contoso Mobile." }
      }
    }
  },
  {
    name: "answer_boss_email",
    description: "Simulate Cowork combining Work IQ email context with the Fabric Data Agent skill.",
    inputSchema: {
      type: "object",
      properties: {
        emailText: { type: "string", description: "Boss email or request text." }
      }
    }
  }
];

export async function handleMcpRequest(message) {
  if (!message || typeof message !== "object") {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request");
  }

  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "fabric-cowork-ontology-demo", version: "1.0.0" },
        capabilities: { tools: {} }
      }
    };
  }

  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools } };
  }

  if (message.method === "tools/call") {
    const { name, arguments: args = {} } = message.params ?? {};
    if (name === "customer_risk_brief") {
      const result = await buildCustomerRiskBrief(args.customerName ?? "Contoso Mobile");
      return toolResult(message.id, result);
    }
    if (name === "answer_boss_email") {
      const result = await answerBossEmail(args.emailText ?? "Can you brief me on Contoso Mobile renewal risk?");
      return toolResult(message.id, result);
    }
    return jsonRpcError(message.id, -32602, `Unknown tool: ${name}`);
  }

  return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
}

function toolResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  };
}
