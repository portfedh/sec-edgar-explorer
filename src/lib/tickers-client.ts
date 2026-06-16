// Client-side helpers for resolving CUSIP→ticker through the internal
// /api/tickers endpoint (which proxies OpenFIGI with a server cache). Used by the
// holdings tables to fill tickers for visible rows, and by their Excel exports to
// resolve the full filtered set.

import { useEffect, useState } from "react";

const REQUEST_CHUNK = 100;

/** Resolve a batch of CUSIPs, chunked to stay within the API's per-request cap. */
export async function fetchTickers(cusips: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(cusips.filter(Boolean))];
  const out: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += REQUEST_CHUNK) {
    const chunk = unique.slice(i, i + REQUEST_CHUNK);
    try {
      const res = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cusips: chunk }),
      });
      const data = (await res.json()) as { tickers?: Record<string, string> };
      Object.assign(out, data.tickers ?? {});
    } catch {
      /* leave this chunk unresolved */
    }
  }
  return out;
}

/**
 * Resolve tickers for the given CUSIPs (typically the currently visible page),
 * fetching only those not already known. Returns a cusip→ticker map that grows
 * as results arrive; unresolved cusips are simply absent.
 */
export function useTickers(cusips: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});

  // Only the cusips we haven't resolved yet; sorted+joined so the effect re-runs
  // only when the actual set of missing cusips changes.
  const missing = [...new Set(cusips.filter((c) => c && !(c in map)))].sort();
  const key = missing.join(",");

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;
    fetchTickers(missing).then((resolved) => {
      if (cancelled) return;
      // Record every requested cusip as known (resolved ones get a ticker; the
      // rest map to "" so we don't keep re-requesting them).
      setMap((prev) => {
        const next = { ...prev };
        for (const c of missing) next[c] = resolved[c] ?? "";
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
