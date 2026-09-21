const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "data");
fs.mkdirSync(outDir, { recursive: true });

const customers = [
  { customer_id: 1, customer_name: "Contoso Mobile", segment: "Enterprise", industry: "Telecommunications", account_manager: "Aline Costa" },
  { customer_id: 2, customer_name: "Fabrikam Retail", segment: "Strategic", industry: "Retail", account_manager: "Bruno Lima" },
  { customer_id: 3, customer_name: "Northwind Logistics", segment: "Enterprise", industry: "Logistics", account_manager: "Carla Souza" }
];

const products = [
  { product_id: 1, product_name: "Enterprise 5G Unlimited", category: "Connectivity", margin_band: "High" },
  { product_id: 2, product_name: "Premium SLA Care", category: "Support", margin_band: "Medium" },
  { product_id: 3, product_name: "IoT Fleet Connect", category: "IoT", margin_band: "High" },
  { product_id: 4, product_name: "Roaming Shield", category: "Mobility", margin_band: "Medium" }
];

const subscriptions = [
  { subscription_id: 1, customer_id: 1, product_id: 1, seats: 18500, arr_usd: 2100000 },
  { subscription_id: 2, customer_id: 1, product_id: 4, seats: 1200, arr_usd: 300000 },
  { subscription_id: 3, customer_id: 2, product_id: 1, seats: 9200, arr_usd: 980000 },
  { subscription_id: 4, customer_id: 2, product_id: 2, seats: 1, arr_usd: 140000 },
  { subscription_id: 5, customer_id: 3, product_id: 3, seats: 4800, arr_usd: 760000 }
];

const usage = [
  { usage_id: 1, customer_id: 1, month: "2026-06", data_tb: 870, roaming_gb: 6200, dropped_call_rate: 0.018 },
  { usage_id: 2, customer_id: 1, month: "2026-07", data_tb: 980, roaming_gb: 7100, dropped_call_rate: 0.022 },
  { usage_id: 3, customer_id: 1, month: "2026-08", data_tb: 1200, roaming_gb: 8200, dropped_call_rate: 0.031 },
  { usage_id: 4, customer_id: 2, month: "2026-08", data_tb: 540, roaming_gb: 1100, dropped_call_rate: 0.011 },
  { usage_id: 5, customer_id: 3, month: "2026-08", data_tb: 330, roaming_gb: 900, dropped_call_rate: 0.009 }
];

const tickets = [
  { ticket_id: 1, customer_id: 1, opened_at: "2026-08-08", severity: "High", status: "Open", sla_breached: 1, topic: "Sao Paulo metro 5G latency" },
  { ticket_id: 2, customer_id: 1, opened_at: "2026-08-19", severity: "Medium", status: "Open", sla_breached: 1, topic: "International roaming invoice dispute" },
  { ticket_id: 3, customer_id: 1, opened_at: "2026-09-02", severity: "High", status: "Open", sla_breached: 0, topic: "Executive escalation on dropped calls" },
  { ticket_id: 4, customer_id: 2, opened_at: "2026-08-23", severity: "Low", status: "Closed", sla_breached: 0, topic: "Plan activation question" }
];

const renewals = [
  { renewal_id: 1, customer_id: 1, renewal_date: "2026-11-01", stage: "Negotiation", nps_score: 19 },
  { renewal_id: 2, customer_id: 2, renewal_date: "2027-01-15", stage: "Healthy", nps_score: 54 },
  { renewal_id: 3, customer_id: 3, renewal_date: "2026-12-20", stage: "Discovery", nps_score: 61 }
];

function toCsv(rows) {
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n") + "\n";
}

const tables = { customers, products, subscriptions, usage_metrics: usage, support_tickets: tickets, renewals };

for (const [name, rows] of Object.entries(tables)) {
  const file = path.join(outDir, `${name}.csv`);
  fs.writeFileSync(file, toCsv(rows), "utf8");
  console.log(`${name}.csv  (${rows.length} linhas)`);
}
