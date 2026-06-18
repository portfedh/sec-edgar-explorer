"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FundBreakdown,
  FundComparison,
  FundPositionDiff,
  DiffCategory,
} from "@/lib/holdings";
import { compactNumber, fullNumber, fileSlug } from "@/lib/format";
import { useTickers, fetchTickers } from "@/lib/tickers-client";

const PAGE_SIZE = 50;

const CATEGORIES: ("All" | DiffCategory)[] = [
  "All",
  "New",
  "Exited",
  "Increased",
  "Decreased",
  "Unchanged",
];

type ProviderSortKey = "toValue" | "deltaValue" | "provider";
type PositionSortKey = "value" | "deltaValue" | "provider" | "issuer";

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
function pct(frac: number): string {
  return `${(frac * 100).toFixed(1)}%`;
}
function signedPts(from: number, to: number): string {
  const d = (to - from) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`;
}

export default function FundsBreakdown({
  cik,
  name,
  options,
  fromAcc,
  toAcc,
  fromPeriod,
  toPeriod,
  comparison,
  breakdown,
  positionDiff,
}: {
  cik: string;
  name: string;
  options: PeriodOption[];
  fromAcc: string;
  toAcc: string;
  fromPeriod: string;
  toPeriod: string;
  comparison: FundComparison;
  breakdown: FundBreakdown; // the `to` period
  positionDiff: FundPositionDiff; // per-position from→to diff
}) {
  const router = useRouter();
  const samePeriod = fromAcc === toAcc;

  const [provSort, setProvSort] = useState<ProviderSortKey>("toValue");
  const [provDir, setProvDir] = useState<"asc" | "desc">("desc");

  const [providerFilter, setProviderFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<"All" | DiffCategory>("All");
  const [query, setQuery] = useState("");
  const [posSort, setPosSort] = useState<PositionSortKey>("value");
  const [posDir, setPosDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  function navigate(next: { from?: string; to?: string }) {
    const f = next.from ?? fromAcc;
    const t = next.to ?? toAcc;
    router.push(`/company/${cik}/funds?from=${f}&to=${t}`);
  }

  const providerRows = useMemo(() => {
    const sign = provDir === "asc" ? 1 : -1;
    return [...comparison.rows].sort((a, b) => {
      if (provSort === "provider") return sign * a.provider.localeCompare(b.provider);
      return sign * (a[provSort] - b[provSort]);
    });
  }, [comparison.rows, provSort, provDir]);

  const providerNames = useMemo(() => {
    const names = new Set(positionDiff.rows.map((r) => r.provider));
    return ["All", ...[...names].sort((a, b) => a.localeCompare(b))];
  }, [positionDiff.rows]);

  const filteredPositions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = positionDiff.rows.filter((p) => {
      if (providerFilter !== "All" && p.provider !== providerFilter) return false;
      if (categoryFilter !== "All" && p.category !== categoryFilter) return false;
      if (q && !p.issuer.toLowerCase().includes(q) && !p.cusip.toLowerCase().includes(q))
        return false;
      return true;
    });
    const sign = posDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (posSort === "issuer") return sign * a.issuer.localeCompare(b.issuer);
      if (posSort === "provider") return sign * a.provider.localeCompare(b.provider);
      if (posSort === "deltaValue") return sign * (a.deltaValue - b.deltaValue);
      return sign * (a.toValue - b.toValue);
    });
  }, [positionDiff.rows, providerFilter, categoryFilter, query, posSort, posDir]);

  const pageCount = Math.max(1, Math.ceil(filteredPositions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredPositions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const tickers = useTickers(pageRows.map((p) => p.cusip));

  function toggleProvSort(key: ProviderSortKey) {
    if (key === provSort) setProvDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setProvSort(key);
      setProvDir(key === "provider" ? "asc" : "desc");
    }
  }
  function togglePosSort(key: PositionSortKey) {
    if (key === posSort) setPosDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setPosSort(key);
      setPosDir(key === "value" || key === "deltaValue" ? "desc" : "asc");
    }
    setPage(0);
  }
  function provArrow(key: ProviderSortKey) {
    return key !== provSort ? "" : provDir === "asc" ? " ▲" : " ▼";
  }
  function posArrow(key: PositionSortKey) {
    return key !== posSort ? "" : posDir === "asc" ? " ▲" : " ▼";
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();

      const trend = wb.addWorksheet("Provider trend");
      trend.columns = [
        { header: "Provider", key: "provider", width: 26 },
        { header: `Value ${fromPeriod} ($)`, key: "fromValue", width: 20, style: { numFmt: "#,##0" } },
        { header: `Value ${toPeriod} ($)`, key: "toValue", width: 20, style: { numFmt: "#,##0" } },
        { header: "Δ Value ($)", key: "deltaValue", width: 18, style: { numFmt: "+#,##0;-#,##0" } },
        { header: "% portfolio (from)", key: "fromPctPortfolio", width: 16, style: { numFmt: "0.0%" } },
        { header: "% portfolio (to)", key: "toPctPortfolio", width: 16, style: { numFmt: "0.0%" } },
        { header: "% funds (from)", key: "fromPctFunds", width: 16, style: { numFmt: "0.0%" } },
        { header: "% funds (to)", key: "toPctFunds", width: 16, style: { numFmt: "0.0%" } },
      ];
      trend.getRow(1).font = { bold: true };
      trend.addRows(providerRows);

      const pos = wb.addWorksheet("Fund positions");
      pos.columns = [
        { header: "Provider", key: "provider", width: 26 },
        { header: "Issuer", key: "issuer", width: 40 },
        { header: "Ticker", key: "ticker", width: 10 },
        { header: "Class", key: "titleOfClass", width: 16 },
        { header: "CUSIP", key: "cusip", width: 12 },
        ...(!samePeriod
          ? [
              { header: `Value ${fromPeriod} ($)`, key: "fromValue", width: 20, style: { numFmt: "#,##0" } },
              { header: `Value ${toPeriod} ($)`, key: "toValue", width: 20, style: { numFmt: "#,##0" } },
              { header: "Δ Value ($)", key: "deltaValue", width: 18, style: { numFmt: "+#,##0;-#,##0" } },
              { header: "Status", key: "category", width: 12 },
            ]
          : [{ header: "Value ($)", key: "toValue", width: 18, style: { numFmt: "#,##0" } }]),
        { header: "% portfolio", key: "toPctOfPortfolio", width: 14, style: { numFmt: "0.0%" } },
        { header: "% funds", key: "toPctOfFunds", width: 14, style: { numFmt: "0.0%" } },
      ];
      pos.getRow(1).font = { bold: true };
      // Resolve tickers for the whole filtered set so the sheet is complete.
      const allTickers = await fetchTickers(filteredPositions.map((p) => p.cusip));
      pos.addRows(filteredPositions.map((p) => ({ ...p, ticker: allTickers[p.cusip] ?? "" })));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `13F-${fileSlug(name)}-funds-${fromPeriod}_to_${toPeriod}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const fundShare =
    breakdown.portfolioTotal > 0 ? breakdown.fundTotal / breakdown.portfolioTotal : 0;

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
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting}
          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
        >
          {exporting ? "Preparing…" : "Save as Excel"}
        </button>
      </div>

      {/* Summary cards (To period) */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Portfolio value" value={money(breakdown.portfolioTotal)} tone="text-slate-900" />
        <Stat label="ETF / fund value" value={money(breakdown.fundTotal)} tone="text-slate-900" />
        <Stat label="Funds % of portfolio" value={pct(fundShare)} tone="text-blue-700" />
        <Stat label="Providers" value={fullNumber(breakdown.providers.length)} tone="text-slate-900" />
        <Stat label="Fund positions" value={fullNumber(breakdown.positions.length)} tone="text-slate-900" />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Provider attribution is best-effort brand-name detection from issuer names; unrecognized
        funds are grouped as “Other ETF / fund”. Values normalized to whole dollars. Summary cards
        reflect the “to” period ({toPeriod}).
      </p>

      {/* Provider trend table */}
      <h2 className="mt-6 text-lg font-semibold text-slate-900">
        Provider proportions{!samePeriod ? `: ${fromPeriod} → ${toPeriod}` : ` (${toPeriod})`}
      </h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="cursor-pointer px-3 py-2 hover:text-slate-700" onClick={() => toggleProvSort("provider")}>
                Provider{provArrow("provider")}
              </th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleProvSort("toValue")}>
                Value{provArrow("toValue")}
              </th>
              {!samePeriod && (
                <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => toggleProvSort("deltaValue")}>
                  Δ Value{provArrow("deltaValue")}
                </th>
              )}
              <th className="px-3 py-2 text-right">% portfolio</th>
              <th className="px-3 py-2 text-right">% of funds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {providerRows.map((r) => (
              <tr key={r.provider} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{r.provider}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {money(r.toValue)}
                </td>
                {!samePeriod && (
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                      r.deltaValue > 0 ? "text-green-700" : r.deltaValue < 0 ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {signedMoney(r.deltaValue)}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {pct(r.toPctPortfolio)}
                  {!samePeriod && (
                    <span className="ml-2 text-xs text-slate-400">({signedPts(r.fromPctPortfolio, r.toPctPortfolio)})</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {pct(r.toPctFunds)}
                  {!samePeriod && (
                    <span className="ml-2 text-xs text-slate-400">({signedPts(r.fromPctFunds, r.toPctFunds)})</span>
                  )}
                </td>
              </tr>
            ))}
            {providerRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  No ETF/fund positions detected in these filings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Fund positions table */}
      <h2 className="mt-6 text-lg font-semibold text-slate-900">
        Fund positions{!samePeriod ? `: ${fromPeriod} → ${toPeriod}` : ` (${toPeriod})`}
      </h2>
      <div className="mt-2 mb-3 flex flex-wrap items-center gap-3">
        <select
          value={providerFilter}
          onChange={(e) => {
            setProviderFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500"
        >
          {providerNames.map((p) => (
            <option key={p} value={p}>
              {p === "All" ? "All providers" : p}
            </option>
          ))}
        </select>
        {!samePeriod && (
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as "All" | DiffCategory);
              setPage(0);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All changes" : c}
              </option>
            ))}
          </select>
        )}
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
        <span className="text-sm text-slate-500">{fullNumber(filteredPositions.length)} positions</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="cursor-pointer px-3 py-2 hover:text-slate-700" onClick={() => togglePosSort("provider")}>
                Provider{posArrow("provider")}
              </th>
              <th className="cursor-pointer px-3 py-2 hover:text-slate-700" onClick={() => togglePosSort("issuer")}>
                Issuer{posArrow("issuer")}
              </th>
              <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => togglePosSort("value")}>
                Value{posArrow("value")}
              </th>
              {!samePeriod && (
                <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-700" onClick={() => togglePosSort("deltaValue")}>
                  Δ Value{posArrow("deltaValue")}
                </th>
              )}
              {!samePeriod && <th className="px-3 py-2">Status</th>}
              <th className="px-3 py-2 text-right">% portfolio</th>
              <th className="px-3 py-2 text-right">% of funds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((p) => (
              <tr key={p.cusip} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{p.provider}</td>
                <td className="px-3 py-2 text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{p.issuer}</span>
                    {tickers[p.cusip] && (
                      <span className="rounded bg-slate-100 px-1.5 font-mono text-xs text-slate-600">
                        {tickers[p.cusip]}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-slate-400">CUSIP {p.cusip}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {money(p.toValue)}
                </td>
                {!samePeriod && (
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                      p.deltaValue > 0 ? "text-green-700" : p.deltaValue < 0 ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {signedMoney(p.deltaValue)}
                  </td>
                )}
                {!samePeriod && (
                  <td className="whitespace-nowrap px-3 py-2">
                    <CategoryBadge category={p.category} />
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {pct(p.toPctOfPortfolio)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {pct(p.toPctOfFunds)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={samePeriod ? 5 : 7} className="px-3 py-8 text-center text-slate-400">
                  No fund positions match these filters.
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

function CategoryBadge({ category }: { category: DiffCategory }) {
  const tone: Record<DiffCategory, string> = {
    New: "bg-green-100 text-green-800",
    Exited: "bg-red-100 text-red-800",
    Increased: "bg-emerald-50 text-emerald-700",
    Decreased: "bg-amber-50 text-amber-700",
    Unchanged: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone[category]}`}>
      {category}
    </span>
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
