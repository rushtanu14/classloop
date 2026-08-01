import checkout from "../server/backend/api/billing/checkout.js";
import portal from "../server/backend/api/billing/portal.js";
import prepareAccount from "../server/backend/api/billing/prepare-account.js";
import webhook from "../server/backend/api/billing/webhook.js";
import cloudState from "../server/backend/api/cloud-state.js";
import configHandler from "../server/backend/api/config.js";
import emailRecaps from "../server/backend/api/email/send-recaps.js";
import feedback from "../server/backend/api/feedback.js";
import integrationsConnect from "../server/backend/api/integrations/connect.js";
import integrationsConnections from "../server/backend/api/integrations/connections.js";
import integrationsImportPreview from "../server/backend/api/integrations/import-preview.js";
import integrationsRecords from "../server/backend/api/integrations/records.js";
import integrationsStatus from "../server/backend/api/integrations/status.js";
import profile from "../server/backend/api/profile.js";
import supabaseKeepalive from "../server/backend/api/ops/supabase-keepalive.js";
import { json } from "../server/backend/api/_shared.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const handlers = new Map([
  ["billing/checkout", checkout],
  ["billing/portal", portal],
  ["billing/prepare-account", prepareAccount],
  ["billing/webhook", webhook],
  ["cloud-state", cloudState],
  ["config", configHandler],
  ["email/send-recaps", emailRecaps],
  ["feedback", feedback],
  ["integrations/connect", integrationsConnect],
  ["integrations/connections", integrationsConnections],
  ["integrations/import-preview", integrationsImportPreview],
  ["integrations/records", integrationsRecords],
  ["integrations/status", integrationsStatus],
  ["ops/supabase-keepalive", supabaseKeepalive],
  ["profile", profile],
]);

function routeFromRequest(request) {
  const queryRoute = request.query?.route;
  const fromQuery = Array.isArray(queryRoute) ? queryRoute.join("/") : queryRoute;
  if (fromQuery) return String(fromQuery).replace(/^\/+|\/+$/g, "");

  const requestUrl = new URL(request.url || "/api/index", `https://${request.headers.host || "classloop.local"}`);
  return requestUrl.pathname.replace(/^\/api\/?/, "").replace(/^\/+|\/+$/g, "");
}

export default function handler(request, response) {
  const route = routeFromRequest(request);
  const routeHandler = handlers.get(route);
  if (!routeHandler) {
    return json(response, 404, { error: "API route not found." });
  }
  return routeHandler(request, response);
}
