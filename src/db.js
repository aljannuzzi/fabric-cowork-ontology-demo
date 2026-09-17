import { DefaultAzureCredential } from "@azure/identity";
import sql from "mssql";

const sampleData = {
  customers: [
    { id: 1, customer_name: "Contoso Mobile", segment: "Enterprise", industry: "Telecommunications", account_manager: "Aline Costa" },
    { id: 2, customer_name: "Fabrikam Retail", segment: "Strategic", industry: "Retail", account_manager: "Bruno Lima" },
    { id: 3, customer_name: "Northwind Logistics", segment: "Enterprise", industry: "Logistics", account_manager: "Carla Souza" }
  ],
  products: [
    { id: 1, product_name: "Enterprise 5G Unlimited", category: "Connectivity", margin_band: "High" },
    { id: 2, product_name: "Premium SLA Care", category: "Support", margin_band: "Medium" },
    { id: 3, product_name: "IoT Fleet Connect", category: "IoT", margin_band: "High" },
    { id: 4, product_name: "Roaming Shield", category: "Mobility", margin_band: "Medium" }
  ],
  subscriptions: [
    { id: 1, customer_id: 1, product_id: 1, seats: 18500, arr_usd: 2100000 },
    { id: 2, customer_id: 1, product_id: 4, seats: 1200, arr_usd: 300000 },
    { id: 3, customer_id: 2, product_id: 1, seats: 9200, arr_usd: 980000 },
    { id: 4, customer_id: 2, product_id: 2, seats: 1, arr_usd: 140000 },
    { id: 5, customer_id: 3, product_id: 3, seats: 4800, arr_usd: 760000 }
  ],
  usage: [
    { customer_id: 1, month: "2026-06", data_tb: 870, roaming_gb: 6200, dropped_call_rate: 0.018 },
    { customer_id: 1, month: "2026-07", data_tb: 980, roaming_gb: 7100, dropped_call_rate: 0.022 },
    { customer_id: 1, month: "2026-08", data_tb: 1200, roaming_gb: 8200, dropped_call_rate: 0.031 },
    { customer_id: 2, month: "2026-08", data_tb: 540, roaming_gb: 1100, dropped_call_rate: 0.011 },
    { customer_id: 3, month: "2026-08", data_tb: 330, roaming_gb: 900, dropped_call_rate: 0.009 }
  ],
  tickets: [
    { customer_id: 1, opened_at: "2026-08-08", severity: "High", status: "Open", sla_breached: true, topic: "Sao Paulo metro 5G latency" },
    { customer_id: 1, opened_at: "2026-08-19", severity: "Medium", status: "Open", sla_breached: true, topic: "International roaming invoice dispute" },
    { customer_id: 1, opened_at: "2026-09-02", severity: "High", status: "Open", sla_breached: false, topic: "Executive escalation on dropped calls" },
    { customer_id: 2, opened_at: "2026-08-23", severity: "Low", status: "Closed", sla_breached: false, topic: "Plan activation question" }
  ],
  renewals: [
    { customer_id: 1, renewal_date: "2026-11-01", stage: "Negotiation", nps_score: 19 },
    { customer_id: 2, renewal_date: "2027-01-15", stage: "Healthy", nps_score: 54 },
    { customer_id: 3, renewal_date: "2026-12-20", stage: "Discovery", nps_score: 61 }
  ]
};

let poolPromise;
let credential;

export function hasSqlConfig() {
  const hasPasswordAuth = Boolean(process.env.SQL_USER && process.env.SQL_PASSWORD);
  const hasEntraAuth = process.env.SQL_AUTH === "entra";
  return Boolean(process.env.SQL_SERVER && process.env.SQL_DATABASE && (hasPasswordAuth || hasEntraAuth));
}

export async function getPool() {
  if (!hasSqlConfig()) {
    return null;
  }

  if (!poolPromise) {
    const config = {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: false
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    if (process.env.SQL_AUTH === "entra") {
      credential ??= new DefaultAzureCredential();
      const token = await credential.getToken("https://database.windows.net/.default");
      config.authentication = {
        type: "azure-active-directory-access-token",
        options: { token: token.token }
      };
    } else {
      config.user = process.env.SQL_USER;
      config.password = process.env.SQL_PASSWORD;
    }

    poolPromise = sql.connect(config);
  }

  return poolPromise;
}

export async function initializeDatabase() {
  const pool = await getPool();
  if (!pool) {
    return { mode: "memory", seeded: true };
  }

  await pool.request().batch(`
IF OBJECT_ID('dbo.customers', 'U') IS NULL
CREATE TABLE dbo.customers (
  id INT PRIMARY KEY,
  customer_name NVARCHAR(100) NOT NULL,
  segment NVARCHAR(50) NOT NULL,
  industry NVARCHAR(100) NOT NULL,
  account_manager NVARCHAR(100) NOT NULL
);

IF OBJECT_ID('dbo.products', 'U') IS NULL
CREATE TABLE dbo.products (
  id INT PRIMARY KEY,
  product_name NVARCHAR(100) NOT NULL,
  category NVARCHAR(50) NOT NULL,
  margin_band NVARCHAR(30) NOT NULL
);

IF OBJECT_ID('dbo.subscriptions', 'U') IS NULL
CREATE TABLE dbo.subscriptions (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES dbo.customers(id),
  product_id INT NOT NULL REFERENCES dbo.products(id),
  seats INT NOT NULL,
  arr_usd DECIMAL(18,2) NOT NULL
);

IF OBJECT_ID('dbo.usage_metrics', 'U') IS NULL
CREATE TABLE dbo.usage_metrics (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES dbo.customers(id),
  [month] CHAR(7) NOT NULL,
  data_tb DECIMAL(18,2) NOT NULL,
  roaming_gb DECIMAL(18,2) NOT NULL,
  dropped_call_rate DECIMAL(9,4) NOT NULL
);

IF OBJECT_ID('dbo.support_tickets', 'U') IS NULL
CREATE TABLE dbo.support_tickets (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES dbo.customers(id),
  opened_at DATE NOT NULL,
  severity NVARCHAR(20) NOT NULL,
  status NVARCHAR(20) NOT NULL,
  sla_breached BIT NOT NULL,
  topic NVARCHAR(200) NOT NULL
);

IF OBJECT_ID('dbo.renewals', 'U') IS NULL
CREATE TABLE dbo.renewals (
  customer_id INT PRIMARY KEY REFERENCES dbo.customers(id),
  renewal_date DATE NOT NULL,
  stage NVARCHAR(50) NOT NULL,
  nps_score INT NOT NULL
);
`);

  const count = await pool.request().query("SELECT COUNT(*) AS total FROM dbo.customers");
  if (count.recordset[0].total > 0) {
    return { mode: "sql", seeded: false };
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const customer of sampleData.customers) {
      await new sql.Request(tx)
        .input("id", sql.Int, customer.id)
        .input("customer_name", sql.NVarChar(100), customer.customer_name)
        .input("segment", sql.NVarChar(50), customer.segment)
        .input("industry", sql.NVarChar(100), customer.industry)
        .input("account_manager", sql.NVarChar(100), customer.account_manager)
        .query("INSERT INTO dbo.customers VALUES (@id, @customer_name, @segment, @industry, @account_manager)");
    }
    for (const product of sampleData.products) {
      await new sql.Request(tx)
        .input("id", sql.Int, product.id)
        .input("product_name", sql.NVarChar(100), product.product_name)
        .input("category", sql.NVarChar(50), product.category)
        .input("margin_band", sql.NVarChar(30), product.margin_band)
        .query("INSERT INTO dbo.products VALUES (@id, @product_name, @category, @margin_band)");
    }
    for (const subscription of sampleData.subscriptions) {
      await new sql.Request(tx)
        .input("id", sql.Int, subscription.id)
        .input("customer_id", sql.Int, subscription.customer_id)
        .input("product_id", sql.Int, subscription.product_id)
        .input("seats", sql.Int, subscription.seats)
        .input("arr_usd", sql.Decimal(18, 2), subscription.arr_usd)
        .query("INSERT INTO dbo.subscriptions VALUES (@id, @customer_id, @product_id, @seats, @arr_usd)");
    }
    for (const item of sampleData.usage) {
      await new sql.Request(tx)
        .input("customer_id", sql.Int, item.customer_id)
        .input("month", sql.Char(7), item.month)
        .input("data_tb", sql.Decimal(18, 2), item.data_tb)
        .input("roaming_gb", sql.Decimal(18, 2), item.roaming_gb)
        .input("dropped_call_rate", sql.Decimal(9, 4), item.dropped_call_rate)
        .query("INSERT INTO dbo.usage_metrics (customer_id, [month], data_tb, roaming_gb, dropped_call_rate) VALUES (@customer_id, @month, @data_tb, @roaming_gb, @dropped_call_rate)");
    }
    for (const ticket of sampleData.tickets) {
      await new sql.Request(tx)
        .input("customer_id", sql.Int, ticket.customer_id)
        .input("opened_at", sql.Date, ticket.opened_at)
        .input("severity", sql.NVarChar(20), ticket.severity)
        .input("status", sql.NVarChar(20), ticket.status)
        .input("sla_breached", sql.Bit, ticket.sla_breached)
        .input("topic", sql.NVarChar(200), ticket.topic)
        .query("INSERT INTO dbo.support_tickets (customer_id, opened_at, severity, status, sla_breached, topic) VALUES (@customer_id, @opened_at, @severity, @status, @sla_breached, @topic)");
    }
    for (const renewal of sampleData.renewals) {
      await new sql.Request(tx)
        .input("customer_id", sql.Int, renewal.customer_id)
        .input("renewal_date", sql.Date, renewal.renewal_date)
        .input("stage", sql.NVarChar(50), renewal.stage)
        .input("nps_score", sql.Int, renewal.nps_score)
        .query("INSERT INTO dbo.renewals VALUES (@customer_id, @renewal_date, @stage, @nps_score)");
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  return { mode: "sql", seeded: true };
}

export async function getCustomerRiskData(customerName) {
  const pool = await getPool();
  if (!pool) {
    return getMemoryRiskData(customerName);
  }

  const customerResult = await pool.request()
    .input("customer_name", sql.NVarChar(100), customerName)
    .query("SELECT TOP 1 * FROM dbo.customers WHERE customer_name LIKE '%' + @customer_name + '%'");

  const customer = customerResult.recordset[0];
  if (!customer) {
    return null;
  }

  const [subscriptions, usage, tickets, renewal] = await Promise.all([
    pool.request()
      .input("customer_id", sql.Int, customer.id)
      .query(`SELECT s.seats, s.arr_usd, p.product_name, p.category, p.margin_band
              FROM dbo.subscriptions s
              JOIN dbo.products p ON p.id = s.product_id
              WHERE s.customer_id = @customer_id`),
    pool.request()
      .input("customer_id", sql.Int, customer.id)
      .query("SELECT [month], data_tb, roaming_gb, dropped_call_rate FROM dbo.usage_metrics WHERE customer_id = @customer_id ORDER BY [month]"),
    pool.request()
      .input("customer_id", sql.Int, customer.id)
      .query("SELECT opened_at, severity, status, sla_breached, topic FROM dbo.support_tickets WHERE customer_id = @customer_id ORDER BY opened_at DESC"),
    pool.request()
      .input("customer_id", sql.Int, customer.id)
      .query("SELECT renewal_date, stage, nps_score FROM dbo.renewals WHERE customer_id = @customer_id")
  ]);

  return {
    customer,
    subscriptions: subscriptions.recordset,
    usage: usage.recordset,
    tickets: tickets.recordset,
    renewal: renewal.recordset[0]
  };
}

function getMemoryRiskData(customerName) {
  const customer = sampleData.customers.find((item) =>
    item.customer_name.toLowerCase().includes(String(customerName).toLowerCase())
  );

  if (!customer) {
    return null;
  }

  return {
    customer,
    subscriptions: sampleData.subscriptions
      .filter((item) => item.customer_id === customer.id)
      .map((item) => ({
        ...item,
        ...sampleData.products.find((product) => product.id === item.product_id)
      })),
    usage: sampleData.usage.filter((item) => item.customer_id === customer.id),
    tickets: sampleData.tickets.filter((item) => item.customer_id === customer.id),
    renewal: sampleData.renewals.find((item) => item.customer_id === customer.id)
  };
}
