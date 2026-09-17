# Fabric-Cowork Ontology Demo

This demo shows Cowork acting as the AI interface for ontology-grounded business data. A boss email is treated as Work IQ context, Cowork invokes an MCP tool, the MCP tool calls a Fabric-style Data Agent, and the Data Agent follows ontology relationships over customer, subscription, product, usage, support, and renewal data.

## Scenario

**NovaTel Enterprise** is a fictional telco. The main live-demo prompt is:

> Can you quickly tell me which enterprise customers are at risk this quarter and what we should do about Contoso Mobile?

The app returns an executive-ready answer grounded in the ontology path:

```text
Customer -> Subscription -> Product -> Usage -> Experience -> Renewal Risk -> Recommended Action
```

## Local run

```powershell
npm install
npm start
```

Open `http://localhost:3000`.

Without SQL environment variables, the app uses in-memory sample data. With SQL variables set, it creates and seeds Azure SQL tables on startup.

## Azure App Service settings

Set these app settings to use Azure SQL:

- `SQL_SERVER`
- `SQL_DATABASE`
- `SQL_USER`
- `SQL_PASSWORD`

## MCP endpoint

The MCP-compatible JSON-RPC endpoint is:

```text
POST /mcp
```

List tools:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

Call the Data Agent:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "customer_risk_brief",
    "arguments": {
      "customerName": "Contoso Mobile"
    }
  }
}
```

## Cowork skill/tool framing

Register the deployed `/mcp` endpoint as a Cowork-accessible skill named **Fabric Customer Intelligence**. Its tool contract is intentionally narrow:

- `customer_risk_brief`: ontology-grounded customer risk brief.
- `answer_boss_email`: demo wrapper that simulates Work IQ email context plus Fabric Data Agent reasoning.

This makes the Data Agent the ontology gatekeeper: agents can ask business questions, but the Data Agent owns graph traversal, semantic joins, and evidence packaging.
