// Server-side loader + parser for a 13F filing's information table (the actual
// list of holdings). A 13F-HR filing contains two documents: the cover page
// (primary_doc.xml) and a separate information-table XML with every position.
// The standard filing viewer only shows the cover, so this module fetches and
// parses the holdings so they can be rendered as a real table.

import "server-only";
import { XMLParser } from "fast-xml-parser";
import { filingFolderBase, filingDocumentUrl } from "./filing-html";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "EDGAR Browser (set SEC_USER_AGENT) example@example.com";

export interface Holding {
  issuer: string;
  titleOfClass: string;
  cusip: string;
  value: number;
  shares: number;
  shType: string; // "SH" or "PRN"
  discretion: string; // SOLE / DFND / OTR
  sole: number;
  shared: number;
  none: number;
}

export interface ThirteenF {
  period: string; // e.g. "03-31-2026"
  reportType: string;
  totalValue: number;
  positionCount: number;
  valueUnit: "dollars" | "thousands";
  holdings: Holding[];
}

// --- tiny in-memory LRU, mirroring filing-html.ts ---
const CACHE_MAX = 12;
const cache = new Map<string, ThirteenF | null>();

function cacheGet(key: string): ThirteenF | null | undefined {
  if (!cache.has(key)) return undefined;
  const hit = cache.get(key);
  cache.delete(key);
  cache.set(key, hit as ThirteenF | null); // refresh recency
  return hit;
}

function cacheSet(key: string, val: ThirteenF | null): void {
  cache.set(key, val);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function fetchText(url: string, revalidate = 86400): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.text();
}

interface IndexJson {
  directory: { item: { name: string; size?: string | number }[] };
}

/**
 * Find the information-table document within a filing by reading its directory
 * listing: the `.xml` file that isn't the cover (primary_doc.xml). Returns the
 * largest such file when several exist, or null (e.g. for 13F-NT notices).
 */
export async function findInfoTableDoc(
  cik: string | number,
  accession: string,
): Promise<string | null> {
  const base = filingFolderBase(cik, accession);
  const res = await fetch(`${base}index.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as IndexJson;

  const candidates = (data.directory?.item ?? [])
    .filter(
      (it) =>
        it.name.toLowerCase().endsWith(".xml") &&
        it.name.toLowerCase() !== "primary_doc.xml",
    )
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));

  return candidates[0]?.name ?? null;
}

function tag(xml: string, name: string): string | undefined {
  // Tolerate an optional namespace prefix (e.g. ns1:periodOfReport).
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`, "i"));
  return m?.[1]?.trim();
}

const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false, // keep raw strings; CUSIPs like "037833100" must not be coerced
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

interface RawInfoTable {
  nameOfIssuer?: string;
  titleOfClass?: string;
  cusip?: string;
  value?: string;
  shrsOrPrnAmt?: { sshPrnamt?: string; sshPrnamtType?: string };
  investmentDiscretion?: string;
  votingAuthority?: { Sole?: string; Shared?: string; None?: string };
}

function parseHoldings(xml: string): Holding[] {
  const doc = parser.parse(xml) as {
    informationTable?: { infoTable?: RawInfoTable | RawInfoTable[] };
  };
  const rows = asArray(doc.informationTable?.infoTable);
  return rows.map((r) => ({
    issuer: str(r.nameOfIssuer),
    titleOfClass: str(r.titleOfClass),
    cusip: str(r.cusip),
    value: num(r.value),
    shares: num(r.shrsOrPrnAmt?.sshPrnamt),
    shType: str(r.shrsOrPrnAmt?.sshPrnamtType),
    discretion: str(r.investmentDiscretion),
    sole: num(r.votingAuthority?.Sole),
    shared: num(r.votingAuthority?.Shared),
    none: num(r.votingAuthority?.None),
  }));
}

/**
 * Load and parse a 13F filing's holdings. Returns null when the filing has no
 * information table (e.g. 13F-NT notices), so callers can fall back to the cover.
 */
export async function getThirteenF(
  cik: string | number,
  accession: string,
): Promise<ThirteenF | null> {
  const base = filingFolderBase(cik, accession);
  const cacheKey = base;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const infoDoc = await findInfoTableDoc(cik, accession);
  if (!infoDoc) {
    cacheSet(cacheKey, null);
    return null;
  }

  // Cover (small) gives the official period + totals; info table gives the rows.
  const [coverXml, infoXml] = await Promise.all([
    fetchText(filingDocumentUrl(cik, accession, "primary_doc.xml")).catch(() => ""),
    fetchText(filingDocumentUrl(cik, accession, infoDoc)),
  ]);

  const holdings = parseHoldings(infoXml);

  const period = tag(coverXml, "periodOfReport") ?? "";
  const reportType = tag(coverXml, "reportType") ?? "13F HOLDINGS REPORT";
  const coverEntries = num(tag(coverXml, "tableEntryTotal"));
  const coverValue = num(tag(coverXml, "tableValueTotal"));

  // Value reporting switched from $thousands to whole dollars for periods ending
  // after 2022; derive the unit from the report year (period is MM-DD-YYYY).
  const year = Number(period.slice(-4));
  const valueUnit: ThirteenF["valueUnit"] = year >= 2023 ? "dollars" : "thousands";

  const result: ThirteenF = {
    period,
    reportType,
    positionCount: coverEntries || holdings.length,
    totalValue: coverValue || holdings.reduce((s, h) => s + h.value, 0),
    valueUnit,
    holdings,
  };
  cacheSet(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Period-over-period comparison
// ---------------------------------------------------------------------------

export type DiffCategory = "New" | "Exited" | "Increased" | "Decreased" | "Unchanged";

export interface DiffRow {
  cusip: string;
  issuer: string;
  titleOfClass: string;
  fromShares: number;
  toShares: number;
  deltaShares: number;
  fromValue: number; // normalized to whole dollars
  toValue: number; // normalized to whole dollars
  deltaValue: number;
  pctShares: number | null; // % change in shares; null for brand-new positions
  category: DiffCategory;
}

export interface HoldingsDiff {
  rows: DiffRow[];
  summary: {
    new: number;
    exited: number;
    increased: number;
    decreased: number;
    unchanged: number;
    fromTotal: number;
    toTotal: number;
    netValue: number; // toTotal - fromTotal, whole dollars
  };
}

interface AggPosition {
  issuer: string;
  titleOfClass: string;
  shares: number;
  value: number; // whole dollars
}

/**
 * Aggregate a filing's rows to one net position per CUSIP (a filing can list a
 * CUSIP across multiple managers/discretion buckets), normalizing value to whole
 * dollars so pre-2023 ($000s) and post-2023 ($) filings compare correctly.
 */
function aggregateByCusip(t: ThirteenF): Map<string, AggPosition> {
  const mult = t.valueUnit === "thousands" ? 1000 : 1;
  const m = new Map<string, AggPosition>();
  for (const h of t.holdings) {
    if (!h.cusip) continue;
    const existing = m.get(h.cusip);
    if (existing) {
      existing.shares += h.shares;
      existing.value += h.value * mult;
    } else {
      m.set(h.cusip, {
        issuer: h.issuer,
        titleOfClass: h.titleOfClass,
        shares: h.shares,
        value: h.value * mult,
      });
    }
  }
  return m;
}

/** Compare two 13F filings (`from` = older, `to` = newer) by CUSIP. */
export function compareHoldings(from: ThirteenF, to: ThirteenF): HoldingsDiff {
  const a = aggregateByCusip(from);
  const b = aggregateByCusip(to);
  const cusips = new Set([...a.keys(), ...b.keys()]);

  const rows: DiffRow[] = [];
  const summary = {
    new: 0,
    exited: 0,
    increased: 0,
    decreased: 0,
    unchanged: 0,
    fromTotal: 0,
    toTotal: 0,
    netValue: 0,
  };

  for (const cusip of cusips) {
    const pa = a.get(cusip);
    const pb = b.get(cusip);
    const fromShares = pa?.shares ?? 0;
    const toShares = pb?.shares ?? 0;
    const fromValue = pa?.value ?? 0;
    const toValue = pb?.value ?? 0;
    summary.fromTotal += fromValue;
    summary.toTotal += toValue;

    let category: DiffCategory;
    if (!pa) category = "New";
    else if (!pb) category = "Exited";
    else if (toShares > fromShares) category = "Increased";
    else if (toShares < fromShares) category = "Decreased";
    else category = "Unchanged";

    summary[category.toLowerCase() as Lowercase<DiffCategory>] += 1;

    rows.push({
      cusip,
      issuer: (pb ?? pa)!.issuer,
      titleOfClass: (pb ?? pa)!.titleOfClass,
      fromShares,
      toShares,
      deltaShares: toShares - fromShares,
      fromValue,
      toValue,
      deltaValue: toValue - fromValue,
      pctShares: fromShares > 0 ? ((toShares - fromShares) / fromShares) * 100 : null,
      category,
    });
  }

  summary.netValue = summary.toTotal - summary.fromTotal;
  return { rows, summary };
}
