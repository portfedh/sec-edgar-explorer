// CIK + accession-number formatting helpers.
//
// Gotchas these encapsulate:
//  - data.sec.gov needs a 10-digit zero-padded CIK ("CIK0000320193").
//  - company_tickers.json gives an integer CIK.
//  - Archives URLs use the *un-padded* integer CIK.
//  - Accession numbers have dashes (0000320193-23-000106); the document
//    folder URL drops them.

/** Parse any CIK-ish input (number, "320193", "CIK0000320193") to an integer. */
export function parseCik(input: string | number): number {
  const digits = String(input).replace(/\D/g, "");
  return parseInt(digits, 10);
}

/** Zero-pad a CIK to the 10-digit form used by data.sec.gov (no prefix). */
export function padCik(input: string | number): string {
  return String(parseCik(input)).padStart(10, "0");
}

/** Strip dashes from an accession number: 0000320193-23-000106 -> 000032019323000106. */
export function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

/** URL of the human-readable filing index page on sec.gov. */
export function filingIndexUrl(cik: string | number, accession: string): string {
  const cikInt = parseCik(cik);
  const noDash = accessionNoDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${accession}-index.htm`;
}

/** URL of a specific document within a filing folder. */
export function filingDocUrl(cik: string | number, accession: string, doc: string): string {
  const cikInt = parseCik(cik);
  const noDash = accessionNoDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/${doc}`;
}
