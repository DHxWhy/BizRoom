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
 * Regex for detecting messages that likely benefit from web grounding.
 * Covers Korean and English trigger keywords for market data, trends, news, etc.
 */
const SEARCH_TRIGGERS =
  /시장|경쟁사|트렌드|최신|현황|통계|뉴스|조사|리서치|업계|산업|동향|market|competitor|trend|latest|stat|news|research|industry/i;

/**
 * Conditionally perform Bing search based on message content.
 * Only triggers for messages that likely need external data grounding.
 * Returns formatted context string, or empty string if not applicable.
 */
export async function getSearchGrounding(message: string): Promise<string> {
  if (!SEARCH_TRIGGERS.test(message)) return "";

  const results = await searchBing(message, 3);
  return formatSearchContext(results);
}
