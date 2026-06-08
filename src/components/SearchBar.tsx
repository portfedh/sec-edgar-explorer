"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TickerEntry } from "@/lib/types";

export default function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TickerEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete query.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/companies?q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(entry: TickerEntry) {
    router.push(`/company/${entry.cik}`);
  }

  // Triggered by the Search button or Enter: navigate to the best match,
  // fetching immediately if the debounced results aren't loaded yet.
  async function runSearch() {
    if (results.length > 0) {
      go(active >= 0 ? results[active] : results[0]);
      return;
    }
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search/companies?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      const list: TickerEntry[] = data.results ?? [];
      setResults(list);
      if (list.length > 0) go(list[0]);
      else setOpen(true);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search by company name or ticker (e.g. Apple, AAPL)"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-9 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              …
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={!q.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
        >
          Search
        </button>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li key={`${r.cik}-${r.ticker}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                  i === active ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="truncate text-sm text-slate-800">{r.title}</span>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                  {r.ticker}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && q.trim() && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-lg">
          No companies found for “{q}”.
        </div>
      )}
    </div>
  );
}
