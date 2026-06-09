"use client";

import { useMemo, useState } from "react";
import type { Holding, ThirteenF } from "@/lib/holdings";
import { compactNumber, fullNumber } from "@/lib/format";

const PAGE_SIZE = 50;

type SortKey = "issuer" | "value" | "shares";
type SortDir = "asc" | "desc";

function sortHoldings(rows: Holding[], key: SortKey, dir: SortDir): Holding[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "issuer") return sign * a.issuer.localeCompare(b.issuer);
    return sign * (a[key] - b[key]);
  });
}

export default function HoldingsTable({ data }: { data: ThirteenF }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const unitLabel = data.valueUnit === "thousands" ? "Value ($000s)" : "Value ($)";
  const totalLabel = data.valueUnit === "thousands" ? "in thousands" : "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? data.holdings.filter(
          (h) =>
            h.issuer.toLowerCase().includes(q) || h.cusip.toLowerCase().includes(q),
        )
      : data.holdings;
    return sortHoldings(base, sortKey, sortDir);
  }, [data.holdings, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "issuer" ? "asc" : "desc");
    }
    setPage(0);
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  // Build a real .xlsx of the currently filtered/sorted holdings, in the browser.
  // exceljs is dynamically imported so it stays out of the main bundle.
  async function exportXlsx() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Holdings");
      ws.columns = [
        { header: "Issuer", key: "issuer", width: 36 },
        { header: "Class", key: "titleOfClass", width: 16 },
        { header: "CUSIP", key: "cusip", width: 12 },
        { header: unitLabel, key: "value", width: 16, style: { numFmt: "#,##0" } },
        { header: "Shares/Prn", key: "shares", width: 14, style: { numFmt: "#,##0" } },
        { header: "Type", key: "shType", width: 8 },
        { header: "Discretion", key: "discretion", width: 12 },
        { header: "Voting (sole)", key: "sole", width: 14, style: { numFmt: "#,##0" } },
        { header: "Voting (shared)", key: "shared", width: 14, style: { numFmt: "#,##0" } },
        { header: "Voting (none)", key: "none", width: 14, style: { numFmt: "#,##0" } },
      ];
      ws.getRow(1).font = { bold: true };
      ws.addRows(filtered);

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `13F-holdings-${data.period || "report"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total value {totalLabel}
            </div>
            <div className="text-lg font-semibold text-slate-900">
              ${fullNumber(data.totalValue)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Positions</div>
            <div className="text-lg font-semibold text-slate-900">
              {fullNumber(data.positionCount)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Period</div>
            <div className="text-lg font-semibold text-slate-900">{data.period || "—"}</div>
          </div>
          <div className="text-sm text-slate-500">{data.reportType}</div>
        </div>
      </div>

      <div className="mt-4 mb-3 flex flex-wrap items-center gap-3">
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
        <span className="text-sm text-slate-500">{fullNumber(filtered.length)} holdings</span>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting || filtered.length === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
        >
          {exporting ? "Preparing…" : "Save as Excel"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="cursor-pointer px-3 py-2 hover:text-slate-700" onClick={() => toggleSort("issuer")}>
                Issuer{arrow("issuer")}
              </th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">CUSIP</th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleSort("value")}>
                {unitLabel}{arrow("value")}
              </th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleSort("shares")}>
                Shares/Prn{arrow("shares")}
              </th>
              <th className="px-3 py-2">Disc.</th>
              <th className="px-3 py-2 text-right">Voting (sole)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((h, i) => (
              <tr key={`${h.cusip}-${i}`} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">{h.issuer}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{h.titleOfClass}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                  {h.cusip}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {fullNumber(h.value)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {compactNumber(h.shares)}
                  {h.shType ? <span className="ml-1 text-slate-400">{h.shType}</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{h.discretion || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {compactNumber(h.sole)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No holdings match your filter.
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
