// Shared types for SEC EDGAR public data.

/** A single ticker/CIK entry from company_tickers.json (normalized). */
export interface TickerEntry {
  cik: number;
  ticker: string;
  title: string;
}

/** Normalized company profile (subset of the submissions API response). */
export interface CompanyProfile {
  cik: string; // 10-digit zero-padded
  cikInt: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  category: string;
  fiscalYearEnd: string; // e.g. "0930"
  entityType: string;
  ein: string;
  website: string;
  stateOfIncorporation: string;
  addresses: SubmissionsResponse["addresses"];
  formerNames: { name: string; from: string; to: string }[];
}

/** A single filing row (zipped from the columnar submissions arrays). */
export interface Filing {
  accessionNumber: string; // with dashes
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  isXBRL: boolean;
  size: number;
  /** URL to the human-readable filing index page on sec.gov. */
  indexUrl: string;
  /** URL to the primary document itself (falls back to index when absent). */
  documentUrl: string;
}

/** Raw submissions API response (only the fields we read). */
export interface SubmissionsResponse {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  category: string;
  fiscalYearEnd: string;
  entityType: string;
  ein: string;
  website: string;
  stateOfIncorporation: string;
  formerNames: { name: string; from: string; to: string }[];
  addresses: {
    mailing?: EdgarAddress;
    business?: EdgarAddress;
  };
  filings: {
    recent: RecentFilings;
    files: { name: string; filingCount: number; filingFrom: string; filingTo: string }[];
  };
}

export interface EdgarAddress {
  street1: string | null;
  street2: string | null;
  city: string | null;
  stateOrCountry: string | null;
  zipCode: string | null;
  stateOrCountryDescription: string | null;
}

/** The columnar arrays inside submissions.filings.recent (and overflow files). */
export interface RecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  acceptanceDateTime: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
  isXBRL: number[];
  size: number[];
}

// ---- XBRL company facts ----

export interface CompanyFactsResponse {
  cik: number;
  entityName: string;
  facts: {
    [taxonomy: string]: {
      [tag: string]: ConceptFact;
    };
  };
}

export interface ConceptFact {
  label: string | null;
  description: string | null;
  units: {
    [unit: string]: FactDataPoint[];
  };
}

export interface FactDataPoint {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}

/** A normalized financial metric series for the UI. */
export interface MetricSeries {
  tag: string;
  label: string;
  unit: string;
  points: { period: string; end: string; val: number; form: string; fy: number; fp: string }[];
}

// ---- Full-text search (efts.sec.gov) ----

export interface FullTextHit {
  accessionNo: string; // e.g. 0000320193-23-000106
  cik: string;
  companyName: string;
  form: string;
  filingDate: string;
  fileName: string;
  filingUrl: string;
}

export interface FullTextSearchResult {
  total: number;
  hits: FullTextHit[];
}
