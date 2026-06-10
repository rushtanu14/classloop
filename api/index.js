import checkout from "../server/api/billing/checkout.js";
import portal from "../server/api/billing/portal.js";
import prepareAccount from "../server/api/billing/prepare-account.js";
import webhook from "../server/api/billing/webhook.js";
import cloudState from "../server/api/cloud-state.js";
import configHandler from "../server/api/config.js";
import emailRecaps from "../server/api/email/send-recaps.js";
import feedback from "../server/api/feedback.js";
import integrationsStatus from "../server/api/integrations/status.js";
import profile from "../server/api/profile.js";
import transcribe from "../server/api/transcribe.js";
import { json } from "../server/api/_shared.js";

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
  ["integrations/status", integrationsStatus],
  ["profile", profile],
  ["transcribe", transcribe],
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
