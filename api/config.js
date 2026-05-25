import { assertIpRateLimit, json, methodNotAllowed, publicConfig, sendApiError } from "./_shared.js";

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, { endpoint: "config", limit: 120, windowMs: 60 * 1000 });
    if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
    return json(response, 200, publicConfig());
  } catch (error) {
    return sendApiError(response, error, "Unable to load hosted configuration.");
  }
}
