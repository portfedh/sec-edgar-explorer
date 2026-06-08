// Loads and caches the SEC ticker -> CIK map (company_tickers.json) and serves
// fast name/ticker search over it. Cached in module memory for the process,
// refreshed daily.

import "server-only";
import type { TickerEntry } from "./types";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "EDGAR Browser (set SEC_USER_AGENT) example@example.com";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let cache: { entries: TickerEntry[]; loadedAt: number } | null = null;
let inflight: Promise<TickerEntry[]> | null = null;

// company_tickers.json shape: { "0": { cik_str, ticker, title }, "1": {...}, ... }
interface RawTickerMap {
  [index: string]: { cik_str: number; ticker: string; title: string };
}

async function load(): Promise<TickerEntry[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`Failed to load company tickers (${res.status})`);
  }
  const raw = (await res.json()) as RawTickerMap;
  return Object.values(raw).map((r) => ({
    cik: r.cik_str,
    ticker: r.ticker,
    title: r.title,
  }));
}

async function getEntries(): Promise<TickerEntry[]> {
  if (cache && Date.now() - cache.loadedAt < ONE_DAY_MS) {
    return cache.entries;
  }
  if (!inflight) {
    inflight = load()
      .then((entries) => {
        cache = { entries, loadedAt: Date.now() };
        return entries;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Search companies by ticker or name. Exact ticker matches and prefix matches
 * rank highest, then substring matches. Returns up to `limit` results.
 */
export async function searchCompanies(query: string, limit = 15): Promise<TickerEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const entries = await getEntries();

  const scored: { entry: TickerEntry; score: number }[] = [];
  for (const e of entries) {
    const ticker = e.ticker.toLowerCase();
    const title = e.title.toLowerCase();
    let score = -1;

    if (ticker === q) score = 0;
    else if (ticker.startsWith(q)) score = 1;
    else if (title.startsWith(q)) score = 2;
    else if (title.includes(q)) score = 3;
    else if (ticker.includes(q)) score = 4;

    if (score >= 0) scored.push({ entry: e, score });
  }

  scored.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  return scored.slice(0, limit).map((s) => s.entry);
}
