import { strict as assert } from "node:assert";
import {
  createFreeResourcesHandler,
  resetFreeResourceCacheForTests,
  searchFreeLearningResources,
  validateFreeResourceQuery,
} from "../server/backend/api/free-resources.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockRequest({ method = "GET", query = {}, headers = {} } = {}) {
  const params = new URLSearchParams(query);
  return {
    method,
    query,
    url: `/api/free-resources${params.size ? `?${params}` : ""}`,
    headers: {
      host: "classloop.test",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      ...headers,
    },
    socket: { remoteAddress: "203.0.113.1" },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
      return this;
    },
    end(payload = "") {
      this.body = String(payload);
      return this;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

assert.equal(validateFreeResourceQuery("  cellular   respiration  "), "cellular respiration");
assert.throws(() => validateFreeResourceQuery(""), (error) => error.statusCode === 400);
assert.throws(() => validateFreeResourceQuery("x"), (error) => error.statusCode === 400);
assert.throws(() => validateFreeResourceQuery("x".repeat(81)), (error) => error.statusCode === 400);
assert.throws(() => validateFreeResourceQuery("safe\u0000unsafe"), (error) => error.statusCode === 400);

const upstreamCalls = [];
const searchResult = await searchFreeLearningResources("cellular respiration", {
  timeoutMs: 500,
  fetchImpl: async (url, options) => {
    upstreamCalls.push({ url: String(url), options });
    const hostname = new URL(url).hostname;
    if (hostname === "en.wikipedia.org") {
      return jsonResponse({
        pages: [
          {
            id: 101,
            key: "Cellular_respiration",
            title: "Cellular respiration",
            description: "Processes used to convert chemical energy",
            excerpt: '<span class="searchmatch">Cellular respiration</span> releases usable energy.',
          },
          { id: 102, key: "../unsafe", title: "Unsafe result", description: "skip me" },
        ],
      });
    }
    if (hostname === "openlibrary.org") {
      return jsonResponse({
        docs: [
          {
            key: "/works/OL123W",
            title: "Cellular Respiration",
            author_name: ["Ada Teacher"],
            first_publish_year: 2020,
          },
          { key: "https://attacker.test/book", title: "Unsafe book" },
        ],
      });
    }
    throw new Error(`Unexpected provider ${hostname}`);
  },
});

assert.equal(upstreamCalls.length, 2);
for (const call of upstreamCalls) {
  const url = new URL(call.url);
  assert.equal(url.searchParams.get("q"), "cellular respiration");
  assert.match(call.options.headers["User-Agent"], /^ClassLoop\//);
  assert.equal(call.options.redirect, "error");
}
assert.deepEqual(
  searchResult.results.map(({ source, title, url }) => ({ source, title, url })),
  [
    {
      source: "Wikipedia",
      title: "Cellular respiration",
      url: "https://en.wikipedia.org/wiki/Cellular_respiration",
    },
    {
      source: "Open Library",
      title: "Cellular Respiration",
      url: "https://openlibrary.org/works/OL123W",
    },
  ],
);
assert.equal(searchResult.results[0].description, "Processes used to convert chemical energy");
assert.match(searchResult.results[1].description, /Ada Teacher/);
assert.deepEqual(searchResult.warnings, []);

const partialResult = await searchFreeLearningResources("geometry", {
  timeoutMs: 500,
  fetchImpl: async (url) => {
    if (new URL(url).hostname === "en.wikipedia.org") throw new Error("provider unavailable");
    return jsonResponse({ docs: [{ key: "/works/OL456W", title: "Geometry", author_name: [] }] });
  },
});
assert.equal(partialResult.results.length, 1);
assert.deepEqual(partialResult.warnings, ["Wikipedia is temporarily unavailable."]);

resetFreeResourceCacheForTests();
let handlerSearchCalls = 0;
const handler = createFreeResourcesHandler({
  search: async (query) => {
    handlerSearchCalls += 1;
    return {
      query,
      results: [
        {
          id: "wikipedia:1",
          title: "Photosynthesis",
          url: "https://en.wikipedia.org/wiki/Photosynthesis",
          description: "Converts light into chemical energy.",
          source: "Wikipedia",
          kind: "article",
        },
      ],
      warnings: [],
    };
  },
});

const firstResponse = mockResponse();
await handler(mockRequest({ query: { q: "photosynthesis" } }), firstResponse);
assert.equal(firstResponse.statusCode, 200);
assert.equal(firstResponse.headers["cache-control"], "no-store");
assert.equal(firstResponse.json().cached, false);
assert.equal(firstResponse.json().query, "photosynthesis");

const cachedResponse = mockResponse();
await handler(mockRequest({ query: { q: "photosynthesis" } }), cachedResponse);
assert.equal(cachedResponse.statusCode, 200);
assert.equal(cachedResponse.json().cached, true);
assert.equal(handlerSearchCalls, 1, "repeat queries should use the short-lived provider cache");

const invalidResponse = mockResponse();
await handler(mockRequest({ query: { q: "x" } }), invalidResponse);
assert.equal(invalidResponse.statusCode, 400);
assert.match(invalidResponse.json().error, /at least 2/i);

const methodResponse = mockResponse();
await handler(mockRequest({ method: "POST", query: { q: "geometry" } }), methodResponse);
assert.equal(methodResponse.statusCode, 405);
assert.equal(methodResponse.headers.allow, "GET");

const rateLimitedHandler = createFreeResourcesHandler({
  search: async (query) => ({ query, results: [], warnings: [] }),
});
let rateLimitedResponse;
for (let attempt = 0; attempt < 13; attempt += 1) {
  rateLimitedResponse = mockResponse();
  await rateLimitedHandler(
    mockRequest({ query: { q: "rate limit" }, headers: { "x-forwarded-for": "203.0.113.250" } }),
    rateLimitedResponse,
  );
}
assert.equal(rateLimitedResponse.statusCode, 429);
assert.match(rateLimitedResponse.json().error, /too many requests/i);

console.log("Free resource provider tests passed.");
