"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Filing } from "@/lib/types";
import { fileSize } from "@/lib/format";

const PAGE_SIZE = 25;

function viewerHref(cik: string, f: Filing): string {
  const sp = new URLSearchParams({
    accession: f.accessionNumber,
    doc: f.primaryDocument || "",
    form: f.form,
    date: f.filingDate,
  });
  return `/company/${cik}/filing?${sp.toString()}`;
}

export default function FilingsTable({ cik, filings }: { cik: string; filings: Filing[] }) {
  const [form, setForm] = useState("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // Distinct form types for the dropdown, sorted by frequency.
  const formTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of filings) counts.set(f.form, (counts.get(f.form) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([f]) => f);
  }, [filings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filings.filter((f) => {
      if (form !== "ALL" && f.form !== form) return false;
      if (q) {
        const hay = `${f.form} ${f.primaryDocDescription} ${f.primaryDocument}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filings, form, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function onFilterChange(next: () => void) {
    next();
    setPage(0);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={form}
          onChange={(e) => onFilterChange(() => setForm(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500"
        >
          <option value="ALL">All forms ({filings.length})</option>
          {formTypes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={query}
          onChange={(e) => onFilterChange(() => setQuery(e.target.value))}
          placeholder="Filter by description…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500"
        />
        <span className="text-sm text-slate-500">{filtered.length} filings</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Form</th>
              <th className="px-3 py-2">Filed</th>
              <th className="px-3 py-2">Report date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((f) => (
              <tr key={f.accessionNumber} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
                    {f.form}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{f.filingDate}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {f.reportDate || "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {f.primaryDocDescription || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {fileSize(f.size)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {f.primaryDocument ? (
                    <Link
                      href={viewerHref(cik, f)}
                      className="text-blue-600 hover:underline"
                    >
                      Open
                    </Link>
                  ) : (
                    <a
                      href={f.indexUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open
                    </a>
                  )}
                  <span className="px-1 text-slate-300">·</span>
                  <a
                    href={f.indexUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:underline"
                  >
                    Index ↗
                  </a>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No filings match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-slate-500">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
