import {
  assertIpRateLimit,
  field,
  json,
  methodNotAllowed,
  readJsonBody,
  requireUser,
  sendApiError,
  validateSchema,
} from "../_shared.js";
import {
  connectTeacherIntegration,
  requireTeacherIntegrationUser,
} from "../../composio-runtime.js";

const CONNECT_RATE_LIMIT = {
  endpoint: "composio-connect",
  limit: 20,
  windowMs: 10 * 60 * 1000,
};
const CONNECT_BODY_MAX_BYTES = 2_000;

export function validateIntegrationConnectPayload(payload) {
  return validateSchema(
    payload,
    {
      integrationId: field.string({ min: 1, max: 80, pattern: /^[a-z0-9_]+$/ }),
    },
    { name: "Integration connection" },
  );
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, CONNECT_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: CONNECT_RATE_LIMIT });
    await requireTeacherIntegrationUser(supabase, user);
    const payload = validateIntegrationConnectPayload(
      await readJsonBody(request, {
        maxBytes: CONNECT_BODY_MAX_BYTES,
        name: "Integration connection",
      }),
    );
    const connection = await connectTeacherIntegration(user, payload.integrationId);
    return json(response, 200, connection);
  } catch (error) {
    return sendApiError(response, error, "Unable to start the integration connection.");
  }
}
