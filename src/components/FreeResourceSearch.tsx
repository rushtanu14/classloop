import { CheckCircle2, ExternalLink, PlusCircle, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

export type FreeLearningResource = {
  id: string;
  title: string;
  url: string;
  description: string;
  source: "Wikipedia" | "Open Library";
  kind: "article" | "book";
  topic: string;
};

type SearchResponse = {
  query: string;
  results: FreeLearningResource[];
  warnings: string[];
};

function safeProviderResult(value: unknown, topic: string): FreeLearningResource | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const source = candidate.source;
  const kind = candidate.kind;
  if (source !== "Wikipedia" && source !== "Open Library") return null;
  if (kind !== "article" && kind !== "book") return null;
  if (![candidate.id, candidate.title, candidate.url, candidate.description].every((field) => typeof field === "string")) {
    return null;
  }
  try {
    const url = new URL(candidate.url as string);
    const allowedHost = source === "Wikipedia" ? "en.wikipedia.org" : "openlibrary.org";
    if (url.protocol !== "https:" || url.hostname !== allowedHost || url.username || url.password || url.port) return null;
    return {
      id: (candidate.id as string).slice(0, 180),
      title: (candidate.title as string).slice(0, 140),
      url: url.toString(),
      description: (candidate.description as string).slice(0, 220),
      source,
      kind,
      topic,
    };
  } catch {
    return null;
  }
}

function parseSearchResponse(value: unknown): SearchResponse {
  if (!value || typeof value !== "object") throw new Error("Search returned an invalid response.");
  const payload = value as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 80) : "";
  if (!query || !Array.isArray(payload.results)) throw new Error("Search returned an invalid response.");
  const results = payload.results
    .map((result) => safeProviderResult(result, query))
    .filter((result): result is FreeLearningResource => Boolean(result));
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.slice(0, 160))
    : [];
  return { query, results, warnings };
}

function normalizedUrl(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function FreeResourceSearch({
  existingUrls,
  onAdd,
}: {
  existingUrls: string[];
  onAdd: (resource: FreeLearningResource) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FreeLearningResource[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const existing = useMemo(() => new Set(existingUrls.map(normalizedUrl)), [existingUrls]);

  const searchResources = async (event: FormEvent) => {
    event.preventDefault();
    const topic = query.replace(/\s+/g, " ").trim();
    if (topic.length < 2 || topic.length > 80) {
      setMessage("Enter a topic between 2 and 80 characters.");
      setResults([]);
      setWarnings([]);
      return;
    }

    setLoading(true);
    setMessage("");
    setWarnings([]);
    try {
      const response = await fetch(`/api/free-resources?q=${encodeURIComponent(topic)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Search is unavailable right now.");
      }
      const parsed = parseSearchResponse(payload);
      setResults(parsed.results);
      setWarnings(parsed.warnings);
      setMessage(parsed.results.length ? "" : "No matching free resources found. Try a more specific topic.");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "Search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="free-resource-search" aria-labelledby="free-resource-search-title">
      <div className="free-resource-search-heading">
        <div>
          <strong id="free-resource-search-title">Find free learning resources</strong>
          <small>Wikipedia articles and Open Library books. Review every result before adding it.</small>
        </div>
      </div>
      <p className="free-resource-privacy">
        Search only the topic you type. ClassLoop never sends the transcript, roster, notes, or student details.
      </p>
      <form className="free-resource-search-form" onSubmit={searchResources}>
        <label className="field compact">
          <span>Search free learning resources</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={80}
            placeholder="Example: photosynthesis"
          />
        </label>
        <button className="ghost-button" type="submit" disabled={loading}>
          <Search size={16} />
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
      {warnings.map((warning) => (
        <p className="settings-message warning" role="status" key={warning}>
          {warning}
        </p>
      ))}
      {results.length > 0 && (
        <div className="free-resource-results" aria-live="polite">
          {results.map((resource) => {
            const added = existing.has(normalizedUrl(resource.url));
            return (
              <article className="free-resource-result" key={resource.id}>
                <div>
                  <span className="eyebrow">{resource.source} · {resource.kind}</span>
                  <h4>{resource.title}</h4>
                  <p>{resource.description}</p>
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    Review source <ExternalLink size={14} />
                  </a>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={added}
                  aria-label={`${added ? "Added" : "Add"} ${resource.title}`}
                  onClick={() => onAdd(resource)}
                >
                  {added ? <CheckCircle2 size={16} /> : <PlusCircle size={16} />}
                  {added ? "Added" : "Add resource"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
