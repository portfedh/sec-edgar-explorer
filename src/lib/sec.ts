// Server-side SEC EDGAR client. All outbound calls go through secFetch so the
// mandatory User-Agent header is always set and responses are cached.
//
// SEC fair-access rules: a descriptive User-Agent is required (otherwise 403),
// and clients must stay under ~10 requests/second.

import "server-only";
import { padCik, parseCik, accessionNoDashes } from "./cik";
import type {
  SubmissionsResponse,
  CompanyProfile,
  Filing,
  RecentFilings,
  CompanyFactsResponse,
  MetricSeries,
  FullTextSearchResult,
  FullTextHit,
} from "./types";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "EDGAR Browser (set SEC_USER_AGENT) example@example.com";

export class SecError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Milliseconds to wait before retrying, from a 429 `Retry-After` header. */
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SecError";
  }
}

/** Parse a `Retry-After` header (seconds or HTTP-date) into milliseconds. */
function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Fetch JSON from an SEC endpoint with the required headers + caching. */
async function secFetch<T>(url: string, revalidate = 3600): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    next: { revalidate },
  });

  if (res.status === 404) {
    throw new SecError("Not found", 404);
  }
  if (!res.ok) {
    throw new SecError(`SEC request failed (${res.status}) for ${url}`, res.status, parseRetryAfter(res));
  }
  return (await res.json()) as T;
}

/** Fetch text (HTML) from an SEC endpoint with the required headers + caching. */
async function secFetchText(url: string, revalidate = 3600): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      "Accept-Encoding": "gzip, deflate",
    },
    next: { revalidate },
  });

  if (res.status === 404) {
    throw new SecError("Not found", 404);
  }
  if (!res.ok) {
    throw new SecError(`SEC request failed (${res.status}) for ${url}`, res.status, parseRetryAfter(res));
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Company submissions (profile + filings)
// ---------------------------------------------------------------------------

/** Zip the columnar arrays from a recent-filings block into row objects. */
function zipFilings(rows: RecentFilings, cik: string): Filing[] {
  const out: Filing[] = [];
  const n = rows.accessionNumber?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const accession = rows.accessionNumber[i];
    const primaryDocument = rows.primaryDocument[i] || "";
    const noDash = accessionNoDashes(accession);
    const cikInt = parseCik(cik);
    out.push({
      accessionNumber: accession,
      filingDate: rows.filingDate[i],
      reportDate: rows.reportDate[i],
      acceptanceDateTime: rows.acceptanceDateTime[i],
      form: rows.form[i],
      primaryDocument,
      primaryDocDescription: rows.primaryDocDescription[i],
      isXBRL: rows.isXBRL[i] === 1,
      size: rows.size[i],
      indexUrl: `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${accession}-index.htm`,
      documentUrl: primaryDocument
        ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${primaryDocument}`
        : `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${accession}-index.htm`,
    });
  }
  return out;
}

export async function getSubmissions(cik: string | number): Promise<SubmissionsResponse> {
  const padded = padCik(cik);
  return secFetch<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${padded}.json`);
}

/** Fetch an overflow filings file referenced by submissions.filings.files[]. */
async function getOverflowFilings(fileName: string): Promise<RecentFilings> {
  return secFetch<RecentFilings>(`https://data.sec.gov/submissions/${fileName}`);
}

export function toProfile(sub: SubmissionsResponse): CompanyProfile {
  return {
    cik: padCik(sub.cik),
    cikInt: parseCik(sub.cik),
    name: sub.name,
    tickers: sub.tickers ?? [],
    exchanges: sub.exchanges ?? [],
    sic: sub.sic,
    sicDescription: sub.sicDescription,
    category: sub.category,
    fiscalYearEnd: sub.fiscalYearEnd,
    entityType: sub.entityType,
    ein: sub.ein,
    website: sub.website,
    stateOfIncorporation: sub.stateOfIncorporation,
    addresses: sub.addresses ?? {},
    formerNames: sub.formerNames ?? [],
  };
}

/**
 * Full company view: profile + filings. Pass includeAll=true to also pull the
 * historical overflow files (for companies with >1000 filings).
 */
export async function getCompany(
  cik: string | number,
  includeAll = false,
): Promise<{ profile: CompanyProfile; filings: Filing[] }> {
  const sub = await getSubmissions(cik);
  const padded = padCik(cik);
  let filings = zipFilings(sub.filings.recent, padded);

  if (includeAll && sub.filings.files?.length) {
    const extra = await Promise.all(
      sub.filings.files.map((f) => getOverflowFilings(f.name)),
    );
    for (const block of extra) {
      filings = filings.concat(zipFilings(block, padded));
    }
    filings.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
  }

  return { profile: toProfile(sub), filings };
}

/**
 * Find the filings immediately newer (prev) and older (next) than the given
 * accession number, for prev/next navigation in the reader. Filings are ordered
 * newest-first, so prev = index-1 (newer) and next = index+1 (older).
 */
export async function getAdjacentFilings(
  cik: string | number,
  accession: string,
): Promise<{ prev: Filing | null; next: Filing | null; current: Filing | null }> {
  const { filings } = await getCompany(cik, true);
  const i = filings.findIndex((f) => f.accessionNumber === accession);
  if (i === -1) return { prev: null, next: null, current: null };
  return {
    prev: i > 0 ? filings[i - 1] : null,
    next: i < filings.length - 1 ? filings[i + 1] : null,
    current: filings[i],
  };
}

// ---------------------------------------------------------------------------
// XBRL company facts (financials)
// ---------------------------------------------------------------------------

export async function getCompanyFacts(cik: string | number): Promise<CompanyFactsResponse> {
  const padded = padCik(cik);
  return secFetch<CompanyFactsResponse>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`,
  );
}

/**
 * Pull a curated set of common financial metrics from company facts, each as a
 * tidy time series (annual figures preferred). Only metrics present are returned.
 */
const DEFAULT_METRICS: { tag: string; label: string }[] = [
  { tag: "Revenues", label: "Revenues" },
  { tag: "RevenueFromContractWithCustomerExcludingAssessedTax", label: "Revenue" },
  { tag: "NetIncomeLoss", label: "Net Income" },
  { tag: "Assets", label: "Total Assets" },
  { tag: "Liabilities", label: "Total Liabilities" },
  { tag: "StockholdersEquity", label: "Stockholders Equity" },
  { tag: "CashAndCashEquivalentsAtCarryingValue", label: "Cash & Equivalents" },
  { tag: "EarningsPerShareDiluted", label: "Diluted EPS" },
];

export function extractMetrics(
  facts: CompanyFactsResponse,
  metrics = DEFAULT_METRICS,
): MetricSeries[] {
  const usGaap = facts.facts["us-gaap"] ?? {};
  const series: MetricSeries[] = [];

  for (const { tag, label } of metrics) {
    const concept = usGaap[tag];
    if (!concept) continue;

    // Choose the unit with the most data points (usually USD or USD/shares).
    const units = Object.entries(concept.units);
    if (units.length === 0) continue;
    units.sort((a, b) => b[1].length - a[1].length);
    const [unit, points] = units[0];

    // Prefer annual (10-K, FY) figures; dedupe by fiscal year, keeping the most
    // recently filed value (handles restatements).
    type Pt = MetricSeries["points"][number] & { filed: string };
    const byPeriod = new Map<number, Pt>();
    for (const p of points) {
      const isAnnual = p.form === "10-K" || p.fp === "FY";
      if (!isAnnual) continue;
      const existing = byPeriod.get(p.fy);
      if (!existing || p.filed > existing.filed) {
        byPeriod.set(p.fy, {
          period: `FY${p.fy}`,
          end: p.end,
          val: p.val,
          form: p.form,
          fy: p.fy,
          fp: p.fp,
          filed: p.filed,
        });
      }
    }

    const seriesPoints = Array.from(byPeriod.values())
      .sort((a, b) => a.fy - b.fy)
      .map(({ filed: _filed, ...rest }) => rest); // drop the dedupe-only field
    if (seriesPoints.length === 0) continue;

    series.push({
      tag,
      label: concept.label || label,
      unit,
      points: seriesPoints,
    });
  }

  return series;
}

// ---------------------------------------------------------------------------
// Full-text search (efts.sec.gov) — covers 2001-present
// ---------------------------------------------------------------------------

interface EftsResponse {
  hits: {
    total: { value: number };
    hits: {
      _id: string; // "<accession>:<filename>"
      _source: {
        ciks: string[]; // filer CIK(s), zero-padded strings
        display_names: string[];
        file_type: string;
        root_forms?: string[];
        file_date: string;
        form?: string;
      };
    }[];
  };
}

export interface FullTextSearchParams {
  q: string;
  forms?: string; // comma-separated, e.g. "10-K,8-K"
  dateRange?: "custom";
  startdt?: string;
  enddt?: string;
  from?: number; // pagination offset
}

export async function fullTextSearch(
  params: FullTextSearchParams,
): Promise<FullTextSearchResult> {
  const url = new URL("https://efts.sec.gov/LATEST/search-index");
  url.searchParams.set("q", params.q);
  if (params.forms) url.searchParams.set("forms", params.forms);
  if (params.startdt && params.enddt) {
    url.searchParams.set("dateRange", "custom");
    url.searchParams.set("startdt", params.startdt);
    url.searchParams.set("enddt", params.enddt);
  }
  if (params.from) url.searchParams.set("from", String(params.from));

  const data = await secFetch<EftsResponse>(url.toString(), 300);

  const hits: FullTextHit[] = data.hits.hits.map((h) => {
    const [accession, fileName] = h._id.split(":");
    const cikInt = parseCik(h._source.ciks?.[0] ?? "");
    const noDash = accessionNoDashes(accession);
    return {
      accessionNo: accession,
      cik: padCik(cikInt),
      // display_names look like "NAME  (TICKERS)  (CIK 0000…)"; keep just NAME.
      companyName: (h._source.display_names?.[0] ?? "Unknown")
        .replace(/\s*\(CIK\s+\d+\)\s*$/, "")
        .replace(/\s*\([A-Z0-9 ,.\-]+\)\s*$/, "")
        .trim(),
      form: h._source.form || h._source.root_forms?.[0] || h._source.file_type,
      filingDate: h._source.file_date,
      fileName,
      filingUrl: `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${fileName}`,
    };
  });

  return { total: data.hits.total.value, hits };
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => HTML_ENTITIES[m] ?? m).trim();
}

/**
 * Find institutional investment managers (13F filers) by name. These entities
 * usually have no exchange ticker, so they are absent from company_tickers.json
 * and unreachable via the ticker search.
 *
 * We use EDGAR's company-name browse endpoint filtered to form 13F-HR, which
 * matches on the *filer's name* (not filing text) and so reliably surfaces the
 * manager even when the name is a common word — efts full-text search buries
 * such names (e.g. "Bridgewater") under unrelated filings that merely mention
 * them. The endpoint's atom output corrupts names ("ARRAY(0x…)") on multi-match,
 * so we parse the HTML, which renders names correctly.
 */
export async function searchManagers(
  q: string,
  limit = 15,
): Promise<{ cik: string; name: string }[]> {
  const term = q.trim();
  if (!term) return [];

  const url = new URL("https://www.sec.gov/cgi-bin/browse-edgar");
  url.searchParams.set("action", "getcompany");
  url.searchParams.set("company", term);
  url.searchParams.set("type", "13F-HR");
  url.searchParams.set("dateb", "");
  url.searchParams.set("owner", "include");
  url.searchParams.set("count", String(limit));
  url.searchParams.set("output", "html");

  const html = await secFetchText(url.toString(), 300);

  // Multi-match: a results table of <a>CIK</a></td><td>Name</td> rows.
  const rowRe = /CIK=(\d+)[^>]*>\s*\d+\s*<\/a><\/td>\s*<td[^>]*>([^<]*)<\/td>/g;
  const out: { cik: string; name: string }[] = [];
  for (let m = rowRe.exec(html); m && out.length < limit; m = rowRe.exec(html)) {
    out.push({ cik: m[1], name: decodeEntities(m[2]) });
  }
  if (out.length > 0) return out;

  // Single exact match: EDGAR redirects to the filer's page (no results table).
  const nameMatch = html.match(/class="companyName">([^<]+)/);
  const cikMatch = html.match(/CIK=(\d{10})/);
  if (nameMatch && cikMatch) {
    return [{ cik: cikMatch[1], name: decodeEntities(nameMatch[1]) }];
  }
  return [];
}
