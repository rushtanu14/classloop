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
import { requireTeacherIntegrationUser } from "../../composio-runtime.js";
import { listIntegrationRecords } from "../../composio-imports.js";

const RECORDS_RATE_LIMIT = {
  endpoint: "composio-records",
  limit: 30,
  windowMs: 10 * 60 * 1000,
};
const RECORDS_BODY_MAX_BYTES = 4_000;

export function validateIntegrationRecordsPayload(payload) {
  return validateSchema(
    payload,
    {
      integrationId: field.string({ min: 1, max: 80, pattern: /^[a-z0-9_]+$/ }),
      query: field.string({ max: 240, optional: true, defaultValue: "" }),
    },
    { name: "Integration records" },
  );
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, RECORDS_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: RECORDS_RATE_LIMIT });
    await requireTeacherIntegrationUser(supabase, user);
    const payload = validateIntegrationRecordsPayload(
      await readJsonBody(request, {
        maxBytes: RECORDS_BODY_MAX_BYTES,
        name: "Integration records",
      }),
    );
    const records = await listIntegrationRecords(user, payload.integrationId, payload.query);
    return json(response, 200, records);
  } catch (error) {
    return sendApiError(response, error, "Unable to load integration records.");
  }
}

