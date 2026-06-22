import { NextRequest, NextResponse } from "next/server";
import { searchManagers, getCompany, SecError } from "@/lib/sec";
import { getThirteenF, compareFundPositions } from "@/lib/holdings";
import { resolveTickers } from "@/lib/cusip-tickers";
import { isoPeriod, baselinePeriod, COMPARE_LABEL, type CompareMode } from "@/lib/format";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A SEC rate-limit (429) — distinct from transient 5xx because the throttle
 *  outlasts a normal short backoff. `holdings.ts` throws a plain Error whose
 *  message embeds the status, so match that too. */
function is429(err: unknown): boolean {
  if (err instanceof SecError) return err.status === 429;
  return err instanceof Error && /\(429\)/.test(err.message);
}

/**
 * Retry a SEC-bound call through transient failures. EDGAR's browse-edgar HTML
 * endpoint (used by searchManagers) intermittently 503s under load; a genuine
 * 404 (entity doesn't exist) is not retried. A 429 (rate limit) gets a much
 * longer backoff — honoring a `Retry-After` header when SEC sends one — since
 * the throttle persists well beyond the normal sub-second retry window.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof SecError && err.status === 404) throw err;
      if (i >= attempts - 1) break;
      const delay = is429(err)
        ? (err instanceof SecError && err.retryAfterMs) || Math.min(3000 * 2 ** i, 20000)
        : baseMs * 2 ** i;
      await sleep(delay + Math.random() * 250);
    }
  }
  throw lastErr;
}

// POST /api/screen/manager  { name }
// Resolves an investment-manager name to its latest two 13F-HR filings and returns
// the flattened ETF/fund positions with their current value (aum) and change (nnb).
// Always responds 200 with a `status` so the client's batch loop can keep going.

export type ScreenStatus = "ok" | "notfound" | "no13f" | "no-funds" | "error";

export interface ScreenRow {
  ticker: string;
  cusip: string;
  provider: string;
  issuer: string;
  aum: number; // to-period value, whole dollars
  nnb: number; // change vs prior period, whole dollars
  category: string;
}

export interface ScreenSuggestion {
  cik: string;
  name: string; // registered EDGAR filer name
}

export interface ScreenResult {
  status: ScreenStatus;
  query: string;
  matchedName?: string;
  cik?: string;
  asof?: string; // YYYY-MM-DD — the "to" (latest) period
  fromPeriod?: string; // YYYY-MM-DD — the baseline period actually compared against
  mode?: CompareMode; // which prior period was requested
  note?: string; // explains a fallback/single-filing comparison (not an error)
  rows?: ScreenRow[];
  message?: string;
  suggestions?: ScreenSuggestion[]; // candidate registered names when notfound
}

/**
 * When an exact-ish name doesn't resolve, look up a few candidate registered
 * names to point the user at the right spelling. We broaden the query (first two
 * words, then the first word) rather than auto-picking one — these are hints for
 * a human to verify, never a silent match.
 */
async function suggestNames(query: string): Promise<ScreenSuggestion[]> {
  const words = query.split(/\s+/).filter((w) => w.length > 1);
  const tries: string[] = [];
  if (words.length >= 2) tries.push(words.slice(0, 2).join(" "));
  if (words.length >= 1) tries.push(words[0]);

  const seen = new Set<string>();
  const out: ScreenSuggestion[] = [];
  for (const t of tries) {
    let res: ScreenSuggestion[] = [];
    try {
      res = await withRetry(() => searchManagers(t, 8));
    } catch {
      res = [];
    }
    for (const r of res) {
      if (seen.has(r.cik)) continue;
      seen.add(r.cik);
      out.push(r);
      if (out.length >= 5) return out;
    }
    if (out.length > 0) break; // first productive broadening is enough
  }
  return out;
}

const VALID_MODES: ReadonlySet<CompareMode> = new Set(["quarter", "year", "ytd"]);

/** Whole-day distance between two ISO dates, for picking a nearest fallback baseline. */
function daysBetween(aIso: string, bIso: string): number {
  return Math.abs((Date.parse(aIso) - Date.parse(bIso)) / 86_400_000);
}

export async function POST(req: NextRequest) {
  let query = "";
  let mode: CompareMode = "quarter";
  try {
    const body = (await req.json()) as { name?: unknown; mode?: unknown };
    query = typeof body.name === "string" ? body.name.trim() : "";
    if (typeof body.mode === "string" && VALID_MODES.has(body.mode as CompareMode)) {
      mode = body.mode as CompareMode;
    }
    if (!query) {
      return NextResponse.json<ScreenResult>({ status: "error", query, mode, message: "Empty name" });
    }

    // 1. Resolve name -> CIK. Prefer an exact (case-insensitive) name match.
    // Matching is strict on purpose: EDGAR's company search is prefix-based, so
    // some trade-name spellings ("WILLIAM BLAIR & CO" vs the registered
    // "WILLIAM BLAIR INVESTMENT MANAGEMENT, LLC") won't resolve. We'd rather
    // report those as notfound than risk a silent wrong match.
    const matches = await withRetry(() => searchManagers(query, 5));
    if (matches.length === 0) {
      const suggestions = await suggestNames(query);
      return NextResponse.json<ScreenResult>({ status: "notfound", query, mode, suggestions });
    }
    const norm = query.toLowerCase();
    const best = matches.find((m) => m.name.toLowerCase() === norm) ?? matches[0];

    // 2. Pull all 13F-HR holdings filings, newest first by report (period) date.
    const { filings } = await withRetry(() => getCompany(best.cik, true));
    const thirteenF = filings
      .filter((f) => f.form === "13F-HR")
      .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1));
    if (thirteenF.length === 0) {
      return NextResponse.json<ScreenResult>({
        status: "no13f",
        query,
        mode,
        matchedName: best.name,
        cik: best.cik,
      });
    }

    // 3. Pick the baseline filing for the requested comparison period.
    //    `to` is the latest filing; `target` is the ideal baseline quarter-end.
    //    Prefer an exact period match; otherwise fall back to the nearest older
    //    filing and record a note explaining what was actually compared.
    const to = thirteenF[0];
    const older = thirteenF.slice(1);
    const target = baselinePeriod(to.reportDate, mode);
    let from = older.find((f) => f.reportDate === target);
    let note: string | undefined;
    if (!from && older.length) {
      from = older.reduce((best, f) =>
        daysBetween(f.reportDate, target) < daysBetween(best.reportDate, target) ? f : best,
      );
      note =
        `${COMPARE_LABEL[mode]} baseline (${target}) not on file; ` +
        `compared against ${from.reportDate} instead.`;
    } else if (!from) {
      note = "Only one 13F-HR on file; no prior period to compare.";
    }

    const fromAcc = from?.accessionNumber ?? to.accessionNumber;
    const [fromData, toData] = await Promise.all([
      withRetry(() => getThirteenF(best.cik, fromAcc)),
      withRetry(() => getThirteenF(best.cik, to.accessionNumber)),
    ]);
    if (!toData) {
      return NextResponse.json<ScreenResult>({
        status: "no-funds",
        query,
        mode,
        matchedName: best.name,
        cik: best.cik,
      });
    }

    // 4. Fund-position diff; keep currently-held funds (aum > 0).
    const diff = compareFundPositions(fromData ?? toData, toData);
    const held = diff.rows.filter((r) => r.toValue > 0);
    if (held.length === 0) {
      return NextResponse.json<ScreenResult>({
        status: "no-funds",
        query,
        mode,
        matchedName: best.name,
        cik: best.cik,
      });
    }

    // 5. Resolve tickers (server-side, cached).
    const tickers = await resolveTickers(held.map((r) => r.cusip));

    const rows: ScreenRow[] = held.map((r) => ({
      ticker: tickers[r.cusip] ?? "",
      cusip: r.cusip,
      provider: r.provider,
      issuer: r.issuer,
      aum: r.toValue,
      nnb: r.deltaValue,
      category: r.category,
    }));

    return NextResponse.json<ScreenResult>({
      status: "ok",
      query,
      mode,
      matchedName: best.name,
      cik: best.cik,
      asof: isoPeriod(toData.period),
      fromPeriod: fromData ? isoPeriod(fromData.period) : undefined,
      note,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screening failed";
    return NextResponse.json<ScreenResult>({ status: "error", query, mode, message });
  }
}
