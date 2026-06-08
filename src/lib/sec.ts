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
  ) {
    super(message);
    this.name = "SecError";
  }
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
    throw new SecError(`SEC request failed (${res.status}) for ${url}`, res.status);
  }
  return (await res.json()) as T;
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
