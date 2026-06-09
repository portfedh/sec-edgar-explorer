"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TickerEntry } from "@/lib/types";

type Mode = "company" | "manager";

/** Unified autocomplete row for both search modes. */
interface SearchResult {
  cik: number | string;
  name: string;
  ticker?: string;
}

// Manager search hits the slower full-text endpoint; don't fire until the user
// has typed enough to be specific.
const MANAGER_MIN_CHARS = 3;

function toResults(mode: Mode, raw: unknown): SearchResult[] {
  const list = (raw as { results?: unknown }).results;
  if (!Array.isArray(list)) return [];
  if (mode === "company") {
    return (list as TickerEntry[]).map((e) => ({
      cik: e.cik,
      name: e.title,
      ticker: e.ticker,
    }));
  }
  return (list as { cik: string; name: string }[]).map((e) => ({
    cik: e.cik,
    name: e.name,
  }));
}

export default function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("company");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const endpoint = mode === "company" ? "/api/search/companies" : "/api/search/managers";
  const tooShort = (term: string) => mode === "manager" && term.length < MANAGER_MIN_CHARS;

  // Debounced autocomplete query.
  useEffect(() => {
    const term = q.trim();
    if (!term || tooShort(term)) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setResults(toResults(mode, data));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode]);

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

  function go(entry: SearchResult) {
    router.push(`/company/${entry.cik}`);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setResults([]);
    setOpen(false);
    setActive(-1);
  }

  // Triggered by the Search button or Enter: navigate to the best match,
  // fetching immediately if the debounced results aren't loaded yet.
  async function runSearch() {
    if (results.length > 0) {
      go(active >= 0 ? results[active] : results[0]);
      return;
    }
    const term = q.trim();
    if (!term || tooShort(term)) return;
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      const list = toResults(mode, data);
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
      <div className="mb-2 inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-sm">
        <ModeButton active={mode === "company"} onClick={() => switchMode("company")}>
          Operating companies
        </ModeButton>
        <ModeButton active={mode === "manager"} onClick={() => switchMode("manager")}>
          Investment managers
        </ModeButton>
      </div>
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
            placeholder={
              mode === "company"
                ? "Search by company name or ticker (e.g. Apple, AAPL)"
                : "Search 13F filers by name (e.g. Renaissance Technologies)"
            }
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
            <li key={`${r.cik}-${r.ticker ?? "mgr"}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                  i === active ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="truncate text-sm text-slate-800">{r.name}</span>
                {r.ticker ? (
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                    {r.ticker}
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                    13F filer
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && q.trim() && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-lg">
          No {mode === "company" ? "companies" : "investment managers"} found for “{q}”.
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
