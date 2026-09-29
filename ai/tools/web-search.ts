import "server-only";
import process from "node:process";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const TIMEOUT_MS = 10_000;

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Real web search. Uses the best configured provider and degrades gracefully:
 * Brave → Tavily → Serper → keyless DuckDuckGo HTML → Wikipedia.
 */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const q = query.trim();
  if (!q) return [];

  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const results = await braveSearch(q);
      if (results.length) return results;
    } catch {
      // fall through to the next provider
    }
  }
  if (process.env.TAVILY_API_KEY) {
    try {
      const results = await tavilySearch(q);
      if (results.length) return results;
    } catch {
      // fall through
    }
  }
  if (process.env.SERPER_API_KEY) {
    try {
      const results = await serperSearch(q);
      if (results.length) return results;
    } catch {
      // fall through
    }
  }
  try {
    const results = await duckDuckGoSearch(q);
    if (results.length) return results;
  } catch {
    // fall through
  }
  return wikipediaSearch(q);
}

async function braveSearch(query: string): Promise<WebResult[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`,
    {
      headers: {
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: stripTags(r.title ?? ""),
      url: String(r.url),
      snippet: stripTags(r.description ?? ""),
    }));
}

async function tavilySearch(query: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ query, max_results: 6, search_depth: "basic" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (data.results ?? []).map((r) => ({
    title: stripTags(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: stripTags(r.content ?? "").slice(0, 400),
  }));
}

async function serperSearch(query: string): Promise<WebResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 6 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
  };
  return (data.organic ?? []).map((r) => ({
    title: stripTags(r.title ?? ""),
    url: String(r.link ?? ""),
    snippet: stripTags(r.snippet ?? ""),
  }));
}

/** Keyless real-web search: DuckDuckGo's HTML endpoint. */
async function duckDuckGoSearch(query: string): Promise<WebResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (compatible; Ultron/1.0)",
    },
    body: new URLSearchParams({ q: query }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();

  const results: WebResult[] = [];
  const blocks = html.split(/class="[^"]*result__body[^"]*"/).slice(1);
  for (const block of blocks) {
    if (results.length >= 6) break;
    const linkMatch = block.match(/class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/);
    if (!linkMatch) continue;
    const url = unwrapDuckUrl(decodeEntities(linkMatch[1]));
    if (!url || !/^https?:/i.test(url)) continue;
    const title = stripTags(block.match(/class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "");
    const snippet = stripTags(
      block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "",
    );
    results.push({ title, url, snippet });
  }
  return results;
}

/** DuckDuckGo wraps outbound links in /l/?uddg=<encoded target>. */
function unwrapDuckUrl(href: string): string {
  const raw = href.startsWith("//") ? `https:${href}` : href;
  if (!raw.includes("duckduckgo.com/l/")) return raw;
  try {
    const target = new URL(raw).searchParams.get("uddg");
    return target ? decodeURIComponent(target) : "";
  } catch {
    return "";
  }
}

async function wikipediaSearch(query: string): Promise<WebResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&srlimit=5&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string }[] };
  };
  return (data.query?.search ?? []).map((hit) => ({
    title: stripTags(hit.title),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/\s+/g, "_"))}`,
    snippet: stripTags(hit.snippet),
  }));
}

/**
 * Fetches a page and reduces it to readable text so the model can actually read
 * a search result instead of only seeing a title and a snippet.
 */
export async function readPage(rawUrl: string, maxChars = 6000): Promise<string> {
  const url = normaliseUrl(rawUrl);
  if (!url) return "Invalid URL.";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Ultron/1.0)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return `Could not fetch page (HTTP ${res.status}).`;
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("json")
      ? JSON.stringify(await res.json()).slice(0, maxChars)
      : stripTags(
          (await res.text())
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, " "),
        );
    return body.slice(0, maxChars) || "(page had no readable text)";
  } catch (err) {
    return `Could not fetch page: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Human-readable rendering of results for the model. */
export function formatResults(query: string, results: WebResult[]): string {
  if (!results.length) return `No web results for "${query}".`;
  return [
    `Web results for "${query}":`,
    ...results.map(
      (r, i) =>
        `${i + 1}. ${r.title || "(untitled)"}\n   ${r.url}\n   ${r.snippet}`.trimEnd(),
    ),
  ].join("\n");
}
