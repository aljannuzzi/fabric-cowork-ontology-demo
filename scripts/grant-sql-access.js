import { DefaultAzureCredential } from "@azure/identity";
import sql from "mssql";

const { SQL_SERVER, SQL_DATABASE, SQL_APP_PRINCIPAL } = process.env;

if (!SQL_SERVER || !SQL_DATABASE || !SQL_APP_PRINCIPAL) {
  throw new Error("SQL_SERVER, SQL_DATABASE, and SQL_APP_PRINCIPAL are required.");
}

if (!/^[\w .@#-]+$/.test(SQL_APP_PRINCIPAL)) {
  throw new Error("SQL_APP_PRINCIPAL contains unsupported characters.");
}

const credential = new DefaultAzureCredential();
const token = await credential.getToken("https://database.windows.net/.default");
const pool = await sql.connect({
  server: SQL_SERVER,
  database: SQL_DATABASE,
  authentication: {
    type: "azure-active-directory-access-token",
    options: { token: token.token }
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
});

const principal = `[${SQL_APP_PRINCIPAL.replaceAll("]", "]]")}]`;

await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'${SQL_APP_PRINCIPAL.replaceAll("'", "''")}')
BEGIN
  CREATE USER ${principal} FROM EXTERNAL PROVIDER;
END;

ALTER ROLE db_datareader ADD MEMBER ${principal};
ALTER ROLE db_datawriter ADD MEMBER ${principal};
ALTER ROLE db_ddladmin ADD MEMBER ${principal};
`);

await pool.close();
console.log(`Granted Azure SQL access to ${SQL_APP_PRINCIPAL}`);
