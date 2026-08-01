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
import { previewIntegrationDraft } from "../../composio-imports.js";

const IMPORT_PREVIEW_RATE_LIMIT = {
  endpoint: "composio-import-preview",
  limit: 30,
  windowMs: 10 * 60 * 1000,
};
const IMPORT_PREVIEW_BODY_MAX_BYTES = 8_000;

export function validateIntegrationImportPreviewPayload(payload) {
  return validateSchema(
    payload,
    {
      integrationId: field.string({ min: 1, max: 80, pattern: /^[a-z0-9_]+$/ }),
      query: field.string({ max: 240, optional: true, defaultValue: "" }),
      selectionKey: field.string({
        min: 16,
        max: 4_096,
        pattern: /^clsi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      }),
    },
    { name: "Integration import preview" },
  );
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, IMPORT_PREVIEW_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, {
      rateLimit: IMPORT_PREVIEW_RATE_LIMIT,
    });
    await requireTeacherIntegrationUser(supabase, user);
    const payload = validateIntegrationImportPreviewPayload(
      await readJsonBody(request, {
        maxBytes: IMPORT_PREVIEW_BODY_MAX_BYTES,
        name: "Integration import preview",
      }),
    );
    const draft = await previewIntegrationDraft(
      user,
      payload.integrationId,
      payload.query,
      payload.selectionKey,
    );
    return json(response, 200, draft);
  } catch (error) {
    return sendApiError(response, error, "Unable to prepare the integration import.");
  }
}
