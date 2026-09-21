import { ConfidentialClientApplication, PublicClientApplication } from "@azure/msal-node";

const TENANT = process.env.AAD_TENANT_ID;
const CLIENT_ID = process.env.AAD_CLIENT_ID;
const CLIENT_SECRET = process.env.AAD_CLIENT_SECRET;
const POWERBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";

// Azure CLI's well-known public client. Used only when no dedicated app
// registration is available (some tenants require a ServiceTree reference to
// create one). Delegated flow, so the Data Agent runs as the signed-in user.
const AZ_CLI_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

let confidential;
let publicApp;

// Refresh tokens rotate on every use; keep the newest one in memory so a
// long-running container keeps working without redeploying.
let currentRefreshToken = process.env.FABRIC_REFRESH_TOKEN || null;
let cachedAccess = { token: null, expiresAt: 0 };

function authority() {
  return `https://login.microsoftonline.com/${TENANT}`;
}

function confidentialClient() {
  if (!confidential) {
    confidential = new ConfidentialClientApplication({
      auth: { clientId: CLIENT_ID, authority: authority(), clientSecret: CLIENT_SECRET }
    });
  }
  return confidential;
}

function publicClient() {
  if (!publicApp) {
    publicApp = new PublicClientApplication({
      auth: { clientId: process.env.AAD_PUBLIC_CLIENT_ID || AZ_CLI_CLIENT_ID, authority: authority() }
    });
  }
  return publicApp;
}

export function authMode() {
  if (TENANT && CLIENT_ID && CLIENT_SECRET) return "service-principal";
  if (TENANT && currentRefreshToken) return "refresh-token";
  if (process.env.FABRIC_STATIC_TOKEN) return "static-token";
  return "none";
}

async function fromRefreshToken() {
  const now = Date.now();
  if (cachedAccess.token && now < cachedAccess.expiresAt - 120000) {
    return cachedAccess.token;
  }

  const r = await publicClient().acquireTokenByRefreshToken({
    refreshToken: currentRefreshToken,
    scopes: [POWERBI_SCOPE],
    forceCache: true
  });

  if (!r?.accessToken) throw new Error("Refresh token exchange returned no access token.");

  // MSAL surfaces the rotated refresh token through the token cache.
  try {
    const cache = JSON.parse(publicClient().getTokenCache().serialize());
    const rts = Object.values(cache.RefreshToken || {});
    if (rts.length && rts[0].secret) currentRefreshToken = rts[0].secret;
  } catch {
    // keep the previous refresh token; it stays valid during the rotation window
  }

  cachedAccess = {
    token: r.accessToken,
    expiresAt: r.expiresOn ? new Date(r.expiresOn).getTime() : now + 3000000
  };
  return cachedAccess.token;
}

/**
 * Resolves a Power BI access token for calling the Fabric Data Agent.
 *
 * Order of preference:
 *   1. Service principal (client credentials) — best for production.
 *   2. Long-lived refresh token — works without admin consent; auto-rotates.
 *   3. Static token — local development only; expires in about an hour.
 */
export async function getFabricToken() {
  if (TENANT && CLIENT_ID && CLIENT_SECRET) {
    const r = await confidentialClient().acquireTokenByClientCredential({ scopes: [POWERBI_SCOPE] });
    if (!r?.accessToken) throw new Error("Client credential flow returned no access token.");
    return r.accessToken;
  }

  if (TENANT && currentRefreshToken) {
    return fromRefreshToken();
  }

  if (process.env.FABRIC_STATIC_TOKEN) {
    return process.env.FABRIC_STATIC_TOKEN;
  }

  throw new Error(
    "No authentication configured. Set AAD_TENANT_ID + FABRIC_REFRESH_TOKEN, " +
    "or AAD_TENANT_ID + AAD_CLIENT_ID + AAD_CLIENT_SECRET, or FABRIC_STATIC_TOKEN."
  );
}
