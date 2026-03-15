// ──────────────────────────────────────────────────────────────────────
// BingSearchService — Bing Web Search API v7 integration for agent grounding
//
// Provides real-time web search results that agents can reference
// during meetings. Degrades gracefully when BING_SEARCH_KEY is not set.
//
// Ref: https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/overview
// ──────────────────────────────────────────────────────────────────────

const BING_ENDPOINT =
  process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search";
const BING_KEY = process.env.BING_SEARCH_KEY || "";

export interface BingSearchResult {
  name: string;
  url: string;
  snippet: string;
}

/**
 * Search Bing Web Search API and return top results.
 * Returns empty array if BING_SEARCH_KEY is not configured or on any error.
 */
export async function searchBing(
  query: string,
  count = 3,
): Promise<BingSearchResult[]> {
  if (!BING_KEY) {
    // Graceful degradation — no search key configured
    return [];
  }

  try {
    const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}&mkt=ko-KR`;
    const res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": BING_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const webPages = (data as Record<string, unknown>).webPages as
      | { value: Array<{ name: string; url: string; snippet: string }> }
      | undefined;
    const results = webPages?.value ?? [];

    return results.map((p) => ({
      name: p.name,
      url: p.url,
      snippet: p.snippet,
    }));
  } catch {
    // Silent failure — agents work without search
    return [];
  }
}

/** Format search results as context string for agent prompt injection */
export function formatSearchContext(results: BingSearchResult[]): string {
  if (results.length === 0) return "";

  return (
    "\n\n## Web Search Results (Bing)\n" +
    results
      .map((r, i) => `${i + 1}. **${r.name}**: ${r.snippet} (${r.url})`)
      .join("\n")
  );
}

/**
 * Explicit user intent to search — only triggers when user directly
 * asks for research/search. Avoids false positives from casual mentions.
 */
const EXPLICIT_SEARCH_INTENT =
  /검색해|조사해|찾아봐|알아봐|리서치해|search for|look up|find out|research this/i;

/**
 * Conditionally perform Bing search based on explicit user request.
 * Only triggers when the user clearly asks for research — NOT on keyword matching.
 * Returns formatted context string, or empty string if not applicable.
 */
export async function getSearchGrounding(message: string): Promise<string> {
  if (!EXPLICIT_SEARCH_INTENT.test(message)) return "";

  const results = await searchBing(message, 3);
  return formatSearchContext(results);
}
