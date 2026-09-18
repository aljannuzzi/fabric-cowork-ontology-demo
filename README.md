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

## Azure deployment (private by design)

Deploy everything with:

```powershell
.\scripts\deploy-azure.ps1
```

The database is never exposed to the internet. The deployed topology is:

```text
Internet -> Container App ingress (MCP + Data Agent API)
              |  (VNet-injected Container Apps environment)
              v
         Private Endpoint (10.42.2.x)
              |
              v
    Azure SQL  (public network access = Disabled, Entra-only auth)
```

Key properties:

- Azure SQL has `publicNetworkAccess = Disabled` and Entra-only authentication (no SQL passwords anywhere).
- The Container Apps environment is injected into a VNet, so app-to-database traffic stays on the private network.
- A private DNS zone `privatelink.database.windows.net` resolves the SQL hostname to the private endpoint IP, so TLS still validates the original hostname.
- The container app authenticates to SQL with its **system-assigned managed identity**, which is set as the SQL Entra admin.
- The container app pulls its image from ACR using the same managed identity (`AcrPull`), so no registry credentials are stored.

App settings used by the container:

- `SQL_SERVER`
- `SQL_DATABASE`
- `SQL_AUTH=entra`

Password authentication (`SQL_USER` / `SQL_PASSWORD`) exists only as a local-development fallback and is not used in Azure.

Only the Data Agent / MCP layer is reachable from outside. That is the point of the architecture: agents talk to the ontology gatekeeper, never directly to the database.

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
