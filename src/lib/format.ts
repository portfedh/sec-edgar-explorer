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
