"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiffCategory, HoldingsDiff as Diff } from "@/lib/holdings";
import { compactNumber, fullNumber } from "@/lib/format";

const PAGE_SIZE = 50;
const CATEGORIES: ("All" | DiffCategory)[] = [
  "All",
  "New",
  "Exited",
  "Increased",
  "Decreased",
  "Unchanged",
];

type SortKey = "deltaValue" | "deltaShares" | "issuer";

interface PeriodOption {
  accession: string;
  label: string;
}

function money(n: number): string {
  return `$${compactNumber(n)}`;
}
function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}$${compactNumber(Math.abs(n))}`;
}
function signedNum(n: number): string {
  return `${n >= 0 ? "+" : "−"}${compactNumber(Math.abs(n))}`;
}
function pct(n: number | null): string {
  if (n === null) return "new";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const BADGE: Record<DiffCategory, string> = {
  New: "bg-green-100 text-green-700",
  Exited: "bg-red-100 text-red-700",
  Increased: "bg-blue-100 text-blue-700",
  Decreased: "bg-amber-100 text-amber-700",
  Unchanged: "bg-slate-100 text-slate-500",
};

export default function HoldingsDiff({
  cik,
  options,
  fromAcc,
  toAcc,
  fromPeriod,
  toPeriod,
  diff,
}: {
  cik: string;
  options: PeriodOption[];
  fromAcc: string;
  toAcc: string;
  fromPeriod: string;
  toPeriod: string;
  diff: Diff;
}) {
  const router = useRouter();
  const [cat, setCat] = useState<"All" | DiffCategory>("All");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deltaValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  function navigate(next: { from?: string; to?: string }) {
    const f = next.from ?? fromAcc;
    const t = next.to ?? toAcc;
    router.push(`/company/${cik}/compare?from=${f}&to=${t}`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = diff.rows.filter((r) => {
      if (cat !== "All" && r.category !== cat) return false;
      if (q && !r.issuer.toLowerCase().includes(q) && !r.cusip.toLowerCase().includes(q))
        return false;
      return true;
    });
    const sign = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sortKey === "issuer") return sign * a.issuer.localeCompare(b.issuer);
      return sign * (a[sortKey] - b[sortKey]);
    });
  }, [diff.rows, cat, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "issuer" ? "asc" : "desc");
    }
    setPage(0);
  }
  function arrow(key: SortKey) {
    return key !== sortKey ? "" : sortDir === "asc" ? " ▲" : " ▼";
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Comparison");
      ws.columns = [
        { header: "Issuer", key: "issuer", width: 36 },
        { header: "CUSIP", key: "cusip", width: 12 },
        { header: "Change", key: "category", width: 12 },
        { header: "Shares (from)", key: "fromShares", width: 14, style: { numFmt: "#,##0" } },
        { header: "Shares (to)", key: "toShares", width: 14, style: { numFmt: "#,##0" } },
        { header: "Δ Shares", key: "deltaShares", width: 14, style: { numFmt: "+#,##0;-#,##0" } },
        { header: "% Δ Shares", key: "pctShares", width: 12, style: { numFmt: "+0.0%;-0.0%" } },
        { header: "Value from ($)", key: "fromValue", width: 16, style: { numFmt: "#,##0" } },
        { header: "Value to ($)", key: "toValue", width: 16, style: { numFmt: "#,##0" } },
        { header: "Δ Value ($)", key: "deltaValue", width: 16, style: { numFmt: "+#,##0;-#,##0" } },
      ];
      ws.getRow(1).font = { bold: true };
      ws.addRows(
        filtered.map((r) => ({
          ...r,
          pctShares: r.pctShares === null ? null : r.pctShares / 100,
        })),
      );
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `13F-compare-${fromPeriod}_to_${toPeriod}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const s = diff.summary;

  return (
    <div>
      {/* Period pickers */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
          From (older)
          <select
            value={fromAcc}
            onChange={(e) => navigate({ from: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500"
          >
            {options.map((o) => (
              <option key={o.accession} value={o.accession}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-slate-400">→</span>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
          To (newer)
          <select
            value={toAcc}
            onChange={(e) => navigate({ to: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500"
          >
            {options.map((o) => (
              <option key={o.accession} value={o.accession}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="New" value={fullNumber(s.new)} tone="text-green-700" />
        <Stat label="Exited" value={fullNumber(s.exited)} tone="text-red-700" />
        <Stat label="Increased" value={fullNumber(s.increased)} tone="text-blue-700" />
        <Stat label="Decreased" value={fullNumber(s.decreased)} tone="text-amber-700" />
        <Stat
          label="Net value change"
          value={signedMoney(s.netValue)}
          tone={s.netValue >= 0 ? "text-green-700" : "text-red-700"}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Portfolio value {money(s.fromTotal)} → {money(s.toTotal)}. Values normalized to whole
        dollars; positions matched by CUSIP.
      </p>

      {/* Controls */}
      <div className="mt-4 mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                cat === c ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Filter by issuer or CUSIP…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500"
        />
        <span className="text-sm text-slate-500">{fullNumber(filtered.length)} rows</span>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting || filtered.length === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
        >
          {exporting ? "Preparing…" : "Save as Excel"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="cursor-pointer px-3 py-2 hover:text-slate-700" onClick={() => toggleSort("issuer")}>
                Issuer{arrow("issuer")}
              </th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2 text-right">Shares from → to</th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleSort("deltaShares")}>
                Δ Shares{arrow("deltaShares")}
              </th>
              <th className="px-3 py-2 text-right">% Δ</th>
              <th className="px-3 py-2 text-right">Value to</th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleSort("deltaValue")}>
                Δ Value{arrow("deltaValue")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((r) => (
              <tr key={r.cusip} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">
                  {r.issuer}
                  <span className="ml-2 font-mono text-xs text-slate-400">{r.cusip}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[r.category]}`}>
                    {r.category}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {compactNumber(r.fromShares)} → {compactNumber(r.toShares)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    r.deltaShares > 0 ? "text-green-700" : r.deltaShares < 0 ? "text-red-700" : "text-slate-500"
                  }`}
                >
                  {signedNum(r.deltaShares)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {pct(r.pctShares)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {money(r.toValue)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    r.deltaValue > 0 ? "text-green-700" : r.deltaValue < 0 ? "text-red-700" : "text-slate-500"
                  }`}
                >
                  {signedMoney(r.deltaValue)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No positions match these filters.
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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
