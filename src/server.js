import express from "express";
import { initializeDatabase, hasSqlConfig } from "./db.js";
import { ontology } from "./ontology.js";
import { answerBossEmail, buildCustomerRiskBrief } from "./dataAgent.js";
import { handleMcpRequest } from "./mcp.js";

const app = express();
const port = process.env.PORT || 3000;
let dbState = { mode: "starting", seeded: false };

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: dbState,
    sqlConfigured: hasSqlConfig()
  });
});

app.get("/api/ontology", (req, res) => {
  res.json(ontology);
});

app.get("/api/agent/brief", async (req, res, next) => {
  try {
    res.json(await buildCustomerRiskBrief(req.query.customer ?? "Contoso Mobile"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cowork/answer", async (req, res, next) => {
  try {
    res.json(await answerBossEmail(req.body.emailText));
  } catch (error) {
    next(error);
  }
});

app.post("/mcp", async (req, res, next) => {
  try {
    res.json(await handleMcpRequest(req.body));
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message });
});

dbState = await initializeDatabase();

app.listen(port, () => {
  console.log(`Fabric-Cowork ontology demo listening on ${port}`);
});
