import { assertIpRateLimit, json, methodNotAllowed, readJsonBody, requireUser, sendApiError } from "./_shared.js";
import { validateCloudWorkspaceStatePayload } from "./validators.js";

const CLOUD_STATE_RATE_LIMIT = { endpoint: "cloud-state", limit: 120, windowMs: 60 * 1000 };
const CLOUD_STATE_BODY_MAX_BYTES = 3_500_000;

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, CLOUD_STATE_RATE_LIMIT);
    if (!["GET", "PUT"].includes(request.method)) return methodNotAllowed(response, ["GET", "PUT"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: CLOUD_STATE_RATE_LIMIT });

    if (request.method === "GET") {
      const { data, error } = await supabase
        .from("classloop_workspace_state")
        .select("state, updated_at")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return json(response, 200, data?.state ?? null);
    }

    if (request.method === "PUT") {
      const payload = validateCloudWorkspaceStatePayload(
        await readJsonBody(request, {
          maxBytes: CLOUD_STATE_BODY_MAX_BYTES,
          name: "Cloud workspace state",
        }),
      );
      const { error } = await supabase.from("classloop_workspace_state").upsert({
        owner_id: user.id,
        state: payload,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json(response, 200, { ok: true, updatedAt: new Date().toISOString() });
    }

    return methodNotAllowed(response, ["GET", "PUT"]);
  } catch (error) {
    return sendApiError(response, error, "Cloud sync failed.");
  }
}
