import {
  assertIpRateLimit,
  json,
  methodNotAllowed,
  requireUser,
  sendApiError,
} from "../_shared.js";
import {
  listTeacherConnections,
  requireTeacherIntegrationUser,
} from "../../composio-runtime.js";

const CONNECTIONS_RATE_LIMIT = {
  endpoint: "composio-connections",
  limit: 60,
  windowMs: 10 * 60 * 1000,
};

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, CONNECTIONS_RATE_LIMIT);
    if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: CONNECTIONS_RATE_LIMIT });
    await requireTeacherIntegrationUser(supabase, user);
    const connections = await listTeacherConnections(user);
    return json(response, 200, { connections });
  } catch (error) {
    return sendApiError(response, error, "Unable to load connected integrations.");
  }
}
