"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FullTextSearchResult } from "@/lib/types";

const COMMON_FORMS = ["", "10-K", "10-Q", "8-K", "S-1", "DEF 14A", "4", "13F-HR"];

export default function FullTextSearch() {
  const router = useRouter();
  const params = useSearchParams();

  const initialQ = params.get("q") ?? "";
  const initialForm = params.get("forms") ?? "";
  const initialStart = params.get("startdt") ?? "";
  const initialEnd = params.get("enddt") ?? "";

  const [q, setQ] = useState(initialQ);
  const [form, setForm] = useState(initialForm);
  const [startdt, setStartdt] = useState(initialStart);
  const [enddt, setEnddt] = useState(initialEnd);

  const [result, setResult] = useState<FullTextSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Run a search whenever the URL query params change.
  useEffect(() => {
    const term = initialQ.trim();
    if (!term) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams({ q: term });
    if (initialForm) sp.set("forms", initialForm);
    if (initialStart && initialEnd) {
      sp.set("startdt", initialStart);
      sp.set("enddt", initialEnd);
    }
    fetch(`/api/search/fulltext?${sp.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Search failed");
          setResult(null);
          return;
        }
        setResult(data);
      })
      .catch(() => setError("Search failed"))
      .finally(() => setLoading(false));
  }, [initialQ, initialForm, initialStart, initialEnd]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (form) sp.set("forms", form);
    if (startdt && enddt) {
      sp.set("startdt", startdt);
      sp.set("enddt", enddt);
    }
    router.push(`/search?${sp.toString()}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Full-text filing search</h1>
      <p className="mt-1 text-sm text-slate-500">
        Search the full text of EDGAR filings (coverage: 2001–present).
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='e.g. "climate risk" or revenue recognition'
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            Form:
            <select
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1"
            >
              {COMMON_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f || "Any"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-slate-600">
            From:
            <input
              type="date"
              value={startdt}
              onChange={(e) => setStartdt(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1 text-slate-600">
            To:
            <input
              type="date"
              value={enddt}
              onChange={(e) => setEnddt(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1"
            />
          </label>
        </div>
      </form>

      <div className="mt-6">
        {loading && <p className="text-slate-400">Searching…</p>}
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
            {error}
          </div>
        )}

        {result && !loading && (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {result.total.toLocaleString()} matching filings
              {result.total > result.hits.length &&
                ` (showing first ${result.hits.length})`}
            </p>
            <ul className="space-y-2">
              {result.hits.map((h) => (
                <li
                  key={`${h.accessionNo}-${h.fileName}`}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
                      {h.form}
                    </span>
                    <span className="text-sm text-slate-400">{h.filingDate}</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-800">{h.companyName}</div>
                  <div className="mt-2 flex gap-3 text-sm">
                    <a
                      href={h.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open filing ↗
                    </a>
                    <Link
                      href={`/company/${h.cik}`}
                      className="text-slate-500 hover:underline"
                    >
                      Company page
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {result.hits.length === 0 && (
              <p className="text-slate-400">No filings matched your search.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
