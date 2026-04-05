// ──────────────────────────────────────────────────────────────────────
// BingSearchService — Web search for agent grounding
//
// Primary:  OpenAI gpt-4o-mini-search-preview (built-in web search, no extra key)
// Fallback: Bing Web Search API v7 (if BING_SEARCH_KEY is set and valid)
//
// Ref: https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/overview
// ──────────────────────────────────────────────────────────────────────

import OpenAI from "openai";

const BING_ENDPOINT =
  process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search";
const BING_KEY = process.env.BING_SEARCH_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

export interface BingSearchResult {
  name: string;
  url: string;
  snippet: string;
}

/** Search using OpenAI gpt-4o-mini-search-preview (built-in web search). */
async function searchOpenAI(query: string, count: number): Promise<BingSearchResult[]> {
  if (!OPENAI_KEY) return [];
  try {
    const client = new OpenAI({ apiKey: OPENAI_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini-search-preview",
      messages: [
        {
          role: "user",
          content: `Search the web for: "${query}"\n\nReturn ONLY a JSON array of exactly ${count} search results. Format:\n[{"name":"title","url":"https://...","snippet":"brief summary"}]\nReturn valid JSON only, no markdown.`,
        },
      ],
      max_tokens: 1000,
      stream: false,
    });

    const text = response.choices[0]?.message?.content ?? "";
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as Array<{ name?: string; url?: string; snippet?: string }>;
    return parsed
      .slice(0, count)
      .filter((r) => r.name && r.snippet)
      .map((r) => ({
        name: r.name ?? "",
        url: r.url ?? "",
        snippet: r.snippet ?? "",
      }));
  } catch (err) {
    console.error("[BingSearchService] OpenAI search failed:", err);
    return [];
  }
}

/**
 * Search for web results. Uses OpenAI gpt-4o-mini-search-preview as primary
 * (built-in web search, no additional API key needed).
 * Falls back to Bing if BING_SEARCH_KEY is configured and valid.
 */
export async function searchBing(
  query: string,
  count = 3,
): Promise<BingSearchResult[]> {
  // Primary: OpenAI web search (gpt-4o-mini-search-preview has built-in browsing)
  if (OPENAI_KEY) {
    const results = await searchOpenAI(query, count);
    if (results.length > 0) return results;
  }

  // Fallback: Bing Search API
  if (!BING_KEY) return [];
  try {
    const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}&mkt=en-US`;
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
  } catch (err) {
    console.error("[BingSearchService] Bing search failed:", err);
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
