// Small presentation helpers (safe to use on client or server).

/** Format a large number compactly: 1234567 -> "1.23M". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Full grouped number: 1234567 -> "1,234,567". */
export function fullNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** Make a string safe for a download filename: "Creative Planning L.P." -> "Creative-Planning-L-P". */
export function fileSlug(s: string): string {
  return (
    (s || "")
      .trim()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "report"
  );
}

/** 13F period "MM-DD-YYYY" -> ISO "YYYY-MM-DD" (returns input unchanged if it doesn't match). */
export function isoPeriod(period: string): string {
  const m = (period || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : period || "";
}

// --- 13F prior-period comparison ------------------------------------------

/** Which prior period a 13F filing is compared against on the screening page. */
export type CompareMode = "quarter" | "year" | "ytd";

export const COMPARE_LABEL: Record<CompareMode, string> = {
  quarter: "Last quarter",
  year: "Last year",
  ytd: "Year to date",
};

// 13F periods are always calendar quarter-ends; map a quarter month to its day.
const QUARTER_END_DAY: Record<number, number> = { 3: 31, 6: 30, 9: 30, 12: 31 };

/**
 * Given the latest filing's quarter-end ISO date ("YYYY-MM-DD"), return the ISO
 * date of the baseline period to compare against for the chosen mode. Assumes the
 * input is a standard quarter-end (month ∈ {3,6,9,12}); returns "" on bad input.
 */
export function baselinePeriod(toIso: string, mode: CompareMode): string {
  const m = (toIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!QUARTER_END_DAY[month]) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  if (mode === "ytd") return `${year - 1}-12-31`;
  if (mode === "year") return `${year - 1}-${pad(month)}-${pad(QUARTER_END_DAY[month])}`;

  // quarter: previous quarter-end (03-31 wraps to the prior year's 12-31).
  const pm = month === 3 ? 12 : month - 3;
  const py = month === 3 ? year - 1 : year;
  return `${py}-${pad(pm)}-${pad(QUARTER_END_DAY[pm])}`;
}

/** Fiscal-year-end code "0930" -> "Sep 30". */
export function fiscalYearEnd(code: string | undefined): string {
  if (!code || code.length !== 4) return "—";
  const month = parseInt(code.slice(0, 2), 10);
  const day = parseInt(code.slice(2), 10);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (month < 1 || month > 12) return "—";
  return `${months[month - 1]} ${day}`;
}

/** Bytes -> "1.2 MB". */
export function fileSize(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
