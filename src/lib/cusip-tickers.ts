// Server-side CUSIP→ticker resolver backed by OpenFIGI (https://www.openfigi.com).
//
// 13F filings contain no ticker, and there is no free authoritative CUSIP→ticker
// map. OpenFIGI maps CUSIP→FIGI→ticker via a free, rate-limited API (FIGI is an
// open standard). Results are cached by CUSIP for the process lifetime so repeat
// views and cross-page hits are free. Works unauthenticated; setting
// OPENFIGI_API_KEY raises the per-request batch size and rate limits.
//
// (Distinct from ./tickers.ts, which serves the SEC company_tickers.json
// name/ticker search keyed by CIK — unrelated to CUSIP lookups.)

import "server-only";

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";
const API_KEY = process.env.OPENFIGI_API_KEY;
// OpenFIGI allows more jobs per request when authenticated.
const BATCH = API_KEY ? 100 : 10;

// cusip -> ticker, or null = looked up but unmapped (so we don't re-query it).
const CACHE_MAX = 5000;
const cache = new Map<string, string | null>();

function cacheSet(cusip: string, ticker: string | null): void {
  cache.set(cusip, ticker);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function normalize(cusip: string): string | null {
  const c = (cusip || "").trim().toUpperCase();
  return /^[0-9A-Z]{9}$/.test(c) ? c : null;
}

interface FigiRecord {
  ticker?: string;
  marketSector?: string;
  securityType?: string;
}
interface FigiResult {
  data?: FigiRecord[];
  warning?: string;
}

function pickTicker(result: FigiResult | undefined): string | null {
  const rows = result?.data;
  if (!rows || rows.length === 0) return null;
  // Prefer an equity/ETF listing; otherwise fall back to the first hit.
  const equity = rows.find((r) => r.marketSector === "Equity" && r.ticker);
  const chosen = equity ?? rows.find((r) => r.ticker);
  return chosen?.ticker ? chosen.ticker.toUpperCase() : null;
}

async function queryBatch(cusips: string[]): Promise<void> {
  const jobs = cusips.map((idValue) => ({ idType: "ID_CUSIP", idValue, exchCode: "US" }));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-OPENFIGI-APIKEY"] = API_KEY;

  const res = await fetch(OPENFIGI_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(jobs),
    cache: "no-store",
  });
  if (!res.ok) {
    // 429 (rate limit) or transient error: leave these cusips uncached so a later
    // request can retry them, and let the caller stop issuing more batches.
    throw new Error(`OpenFIGI ${res.status}`);
  }
  const results = (await res.json()) as FigiResult[];
  cusips.forEach((cusip, i) => cacheSet(cusip, pickTicker(results[i])));
}

/**
 * Resolve tickers for a list of CUSIPs. Returns a map of cusip→ticker for those
 * that resolved to a ticker (unmapped/failed cusips are simply absent). Cached
 * results are returned immediately; only uncached cusips hit OpenFIGI.
 */
export async function resolveTickers(cusips: string[]): Promise<Record<string, string>> {
  const valid = [...new Set(cusips.map(normalize).filter((c): c is string => !!c))];

  const uncached = valid.filter((c) => !cache.has(c));
  for (let i = 0; i < uncached.length; i += BATCH) {
    try {
      await queryBatch(uncached.slice(i, i + BATCH));
    } catch {
      // Stop early on rate limit / error; whatever resolved so far is returned,
      // and the rest stay uncached for a later attempt.
      break;
    }
  }

  const out: Record<string, string> = {};
  for (const c of valid) {
    const t = cache.get(c);
    if (t) out[c] = t;
  }
  return out;
}
