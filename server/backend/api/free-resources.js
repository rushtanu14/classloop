import { createHash } from "node:crypto";
import { assertIpRateLimit, httpError, json, methodNotAllowed, sendApiError } from "./_shared.js";

const PROVIDER_TIMEOUT_MS = 5_500;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const USER_AGENT = "ClassLoop/0.1 (https://classloop-followup.vercel.app/support)";
const freeResourceCache = new Map();

function plainText(value, maxLength = 220) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateFreeResourceQuery(value) {
  if (typeof value !== "string") throw httpError(400, "Enter a topic to search.");
  if (/[\u0000-\u001f\u007f]/.test(value)) throw httpError(400, "The topic contains unsupported characters.");
  const query = value.replace(/\s+/g, " ").trim();
  if (query.length < 2) throw httpError(400, "The topic must be at least 2 characters.");
  if (query.length > 80) throw httpError(400, "The topic must be 80 characters or fewer.");
  return query;
}

async function fetchProviderJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function wikipediaResults(payload) {
  if (!Array.isArray(payload?.pages)) return [];
  return payload.pages.slice(0, 4).flatMap((page) => {
    const id = Number.isInteger(page?.id) ? page.id : null;
    const key = typeof page?.key === "string" ? page.key.trim() : "";
    const title = plainText(page?.title, 140);
    if (!id || !key || !title || key.length > 220 || /[\\/]/.test(key) || key.startsWith(".")) return [];
    const description = plainText(page?.description || page?.excerpt) || "Wikipedia article";
    return [
      {
        id: `wikipedia:${id}`,
        title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        description,
        source: "Wikipedia",
        kind: "article",
      },
    ];
  });
}

function openLibraryResults(payload) {
  if (!Array.isArray(payload?.docs)) return [];
  return payload.docs.slice(0, 4).flatMap((book) => {
    const key = typeof book?.key === "string" ? book.key.trim() : "";
    const title = plainText(book?.title, 140);
    if (!/^\/works\/OL\d+W$/.test(key) || !title) return [];
    const authors = Array.isArray(book?.author_name)
      ? book.author_name.map((author) => plainText(author, 80)).filter(Boolean).slice(0, 2)
      : [];
    const year = Number.isInteger(book?.first_publish_year) ? book.first_publish_year : null;
    const details = [authors.length ? `By ${authors.join(", ")}` : "", year ? `First published ${year}` : ""].filter(Boolean);
    return [
      {
        id: `open-library:${key.slice("/works/".length)}`,
        title,
        url: `https://openlibrary.org${key}`,
        description: details.join(" · ") || "Book record from Open Library",
        source: "Open Library",
        kind: "book",
      },
    ];
  });
}

async function searchWikipedia(query, options) {
  const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "4");
  return wikipediaResults(await fetchProviderJson(url, options));
}

async function searchOpenLibrary(query, options) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "4");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year");
  return openLibraryResults(await fetchProviderJson(url, options));
}

export async function searchFreeLearningResources(
  queryValue,
  { fetchImpl = globalThis.fetch, timeoutMs = PROVIDER_TIMEOUT_MS } = {},
) {
  const query = validateFreeResourceQuery(queryValue);
  if (typeof fetchImpl !== "function") throw httpError(503, "Free resource search is unavailable right now.");

  const options = { fetchImpl, timeoutMs };
  const providers = [
    ["Wikipedia", searchWikipedia(query, options)],
    ["Open Library", searchOpenLibrary(query, options)],
  ];
  const settled = await Promise.allSettled(providers.map(([, request]) => request));
  const warnings = [];
  const results = [];

  settled.forEach((outcome, index) => {
    const provider = providers[index][0];
    if (outcome.status === "rejected") {
      warnings.push(`${provider} is temporarily unavailable.`);
      return;
    }
    results.push(...outcome.value);
  });

  const deduplicated = Array.from(new Map(results.map((result) => [result.url, result])).values());
  return { query, results: deduplicated, warnings };
}

function queryFromRequest(request) {
  const direct = request.query?.q;
  if (Array.isArray(direct)) return direct[0];
  if (direct !== undefined) return direct;
  const url = new URL(request.url || "/api/free-resources", `https://${request.headers.host || "classloop.local"}`);
  return url.searchParams.get("q") || "";
}

function cacheKey(query) {
  return createHash("sha256").update(query.toLocaleLowerCase("en-US")).digest("hex");
}

function cleanCache(now) {
  for (const [key, entry] of freeResourceCache) {
    if (entry.expiresAt <= now) freeResourceCache.delete(key);
  }
  if (freeResourceCache.size < MAX_CACHE_ENTRIES) return;
  const oldestKey = freeResourceCache.keys().next().value;
  if (oldestKey) freeResourceCache.delete(oldestKey);
}

export function resetFreeResourceCacheForTests() {
  freeResourceCache.clear();
}

export function createFreeResourcesHandler({ search = searchFreeLearningResources, now = () => Date.now() } = {}) {
  return async function freeResourcesHandler(request, response) {
    try {
      assertIpRateLimit(request, response, { endpoint: "free-resources", limit: 12, windowMs: 60 * 1000 });
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

      const query = validateFreeResourceQuery(queryFromRequest(request));
      const currentTime = now();
      cleanCache(currentTime);
      const key = cacheKey(query);
      const cached = freeResourceCache.get(key);
      if (cached?.expiresAt > currentTime) {
        return json(response, 200, { query, ...cached.payload, cached: true });
      }

      const result = await search(query);
      const payload = {
        results: Array.isArray(result?.results) ? result.results : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      };
      freeResourceCache.set(key, { payload, expiresAt: currentTime + CACHE_TTL_MS });
      return json(response, 200, { query, ...payload, cached: false });
    } catch (error) {
      return sendApiError(response, error, "Unable to search free learning resources.");
    }
  };
}

export default createFreeResourcesHandler();
