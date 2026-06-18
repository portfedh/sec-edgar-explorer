"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { compactNumber, fullNumber } from "@/lib/format";

// Mirrors the /api/screen/manager response (kept local so this client module
// never imports the server-only route).
type ScreenStatus = "ok" | "notfound" | "no13f" | "no-funds" | "error";
interface ScreenRow {
  ticker: string;
  cusip: string;
  provider: string;
  issuer: string;
  aum: number;
  nnb: number;
  category: string;
}
interface ScreenSuggestion {
  cik: string;
  name: string;
}
interface ScreenResult {
  status: ScreenStatus;
  query: string;
  matchedName?: string;
  cik?: string;
  asof?: string;
  rows?: ScreenRow[];
  message?: string;
  suggestions?: ScreenSuggestion[];
}

const CONCURRENCY = 3; // conservative vs SEC fair-access (each manager fans out to several SEC calls)
const STORAGE_KEY = "funds-screening-v1";

// First-row values treated as a header and skipped (case-insensitive).
const HEADER_NAMES = new Set([
  "investment_manager",
  "investment manager",
  "master_firm",
  "manager",
  "firm",
  "name",
]);

const STATUS_LABEL: Record<ScreenStatus, string> = {
  ok: "Matched",
  notfound: "Not found",
  no13f: "No 13F",
  "no-funds": "No funds",
  error: "Error",
};

/** Parse an uploaded CSV/text list into a clean, de-duped list of manager names. */
function parseNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    // Unwrap a quoted field (handles names with commas, e.g. "AFAM CAPITAL, INC.").
    if (line.startsWith('"')) {
      const end = line.lastIndexOf('"');
      if (end > 0) line = line.slice(1, end).replace(/""/g, '"');
    } else if (line.includes(",")) {
      // Defensive: take the first column if a stray multi-column row appears.
      line = line.split(",")[0].trim();
    }
    line = line.trim();
    if (!line) continue;
    // Skip a header row.
    if (i === 0 && HEADER_NAMES.has(line.toLowerCase())) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

interface Checkpoint {
  names: string[];
  results: ScreenResult[];
}

export default function ScreenPage() {
  const [names, setNames] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  // results keyed by query name.
  const [resultMap, setResultMap] = useState<Map<string, ScreenResult>>(new Map());
  const abortRef = useRef(false);

  const results = useMemo(() => [...resultMap.values()], [resultMap]);
  const processed = results.length;

  const counts = useMemo(() => {
    const c: Record<ScreenStatus, number> = {
      ok: 0,
      notfound: 0,
      no13f: 0,
      "no-funds": 0,
      error: 0,
    };
    for (const r of results) c[r.status] += 1;
    return c;
  }, [results]);

  const exportRows = useMemo(
    () =>
      results
        .filter((r) => r.status === "ok" && r.rows)
        .flatMap((r) =>
          r.rows!.map((row) => ({
            Theasof_dt: r.asof ?? "",
            master_firm: r.matchedName ?? r.query,
            product_ticker: row.ticker,
            aum: row.aum,
            nnb: row.nnb,
            provider: row.provider,
            issuer: row.issuer,
            cusip: row.cusip,
            category: row.category,
          })),
        ),
    [results],
  );

  // --- checkpointing (debounced; survives a reload) ------------------------
  useEffect(() => {
    if (!storageOk || names.length === 0) return;
    const id = setTimeout(() => {
      try {
        const cp: Checkpoint = { names, results };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cp));
      } catch {
        setStorageOk(false); // quota exceeded — keep running, just stop persisting
      }
    }, 1500);
    return () => clearTimeout(id);
  }, [names, results, storageOk]);

  // Restore a prior run on mount (post-hydration to avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cp = JSON.parse(raw) as Checkpoint;
      if (Array.isArray(cp.names) && cp.names.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration restore from localStorage
        setNames(cp.names);
        setResultMap(new Map(cp.results.map((r) => [r.query, r])));
        setFileName("(restored from last session)");
      }
    } catch {
      /* ignore corrupt checkpoint */
    }
  }, []);

  // --- file upload ---------------------------------------------------------
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseNames(text);
    abortRef.current = true;
    setResultMap(new Map());
    setNames(parsed);
    setFileName(file.name);
    setStorageOk(true);
    e.target.value = ""; // allow re-selecting the same file
  }

  // --- the screening run ---------------------------------------------------
  const runPool = useCallback(async (queue: string[]) => {
    if (queue.length === 0) return;
    abortRef.current = false;
    setRunning(true);
    let cursor = 0;
    const worker = async () => {
      while (!abortRef.current) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const name = queue[idx];
        let data: ScreenResult;
        try {
          const res = await fetch("/api/screen/manager", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          data = (await res.json()) as ScreenResult;
        } catch (err) {
          data = {
            status: "error",
            query: name,
            message: err instanceof Error ? err.message : "Network error",
          };
        }
        setResultMap((prev) => new Map(prev).set(name, data));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  }, []);

  function start() {
    const pending = names.filter((n) => !resultMap.has(n));
    void runPool(pending.length ? pending : names);
  }

  function retryFailures() {
    const failed = results
      .filter((r) => r.status === "notfound" || r.status === "error")
      .map((r) => r.query);
    void runPool(failed);
  }

  function stop() {
    abortRef.current = true;
  }

  function reset() {
    abortRef.current = true;
    setResultMap(new Map());
    setNames([]);
    setFileName("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // --- Excel export --------------------------------------------------------
  async function exportXlsx() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();

      const sheet = wb.addWorksheet("Screening");
      sheet.columns = [
        { header: "report_date", key: "Theasof_dt", width: 14 },
        { header: "investment_manager", key: "master_firm", width: 40 },
        { header: "product_ticker", key: "product_ticker", width: 14 },
        { header: "value_usd", key: "aum", width: 18, style: { numFmt: "#,##0" } },
        { header: "change_usd", key: "nnb", width: 26, style: { numFmt: "+#,##0;-#,##0" } },
        { header: "provider", key: "provider", width: 24 },
        { header: "issuer", key: "issuer", width: 40 },
        { header: "cusip", key: "cusip", width: 12 },
        { header: "status", key: "category", width: 12 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.addRows(exportRows);

      const misses = results.filter((r) => r.status !== "ok");
      if (misses.length) {
        const un = wb.addWorksheet("Unmatched");
        un.columns = [
          { header: "name_in_list", key: "query", width: 40 },
          { header: "status", key: "status", width: 14 },
          { header: "matched_name", key: "matchedName", width: 40 },
          { header: "cik", key: "cik", width: 14 },
          { header: "reason", key: "message", width: 30 },
          { header: "possible_registered_names", key: "suggestions", width: 60 },
        ];
        un.getRow(1).font = { bold: true };
        un.addRows(
          misses.map((r) => ({
            query: r.query,
            status: STATUS_LABEL[r.status],
            matchedName: r.matchedName ?? "",
            cik: r.cik ?? "",
            message: r.message ?? "",
            suggestions: (r.suggestions ?? [])
              .map((s) => `${s.name} (CIK ${s.cik})`)
              .join("; "),
          })),
        );
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `funds-screening-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const total = names.length;
  const pctDone = total ? Math.round((processed / total) * 100) : 0;
  const recent = results.slice(-50).reverse();
  const failures = counts.notfound + counts.error;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Batch fund screening</h1>
      <p className="mt-1 text-sm text-slate-500">
        Screen many investment managers at once for their ETF / fund holdings, compare against the
        prior period, and export the results to Excel.
      </p>

      <div className="mt-4 space-y-2">
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900">
            <span>How it works</span>
            <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-4 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <div className="grid gap-3 sm:grid-cols-3">
              <Step n={1} title="Upload">
                A single-column CSV of manager names. A header row (e.g.{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">investment_manager</code>
                ) is detected and skipped.
              </Step>
              <Step n={2} title="Screen">
                Each manager&apos;s latest 13F is scanned for ETF / fund holdings and compared with
                the prior period.
              </Step>
              <Step n={3} title="Export">
                Download an Excel sheet, one row per manager × product.
              </Step>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Columns
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <Col name="report_date" desc="filing period (as-of date)" />
                <Col name="investment_manager" desc="matched EDGAR filer name" />
                <Col name="product_ticker" desc="ETF / fund ticker" />
                <Col name="value_usd" desc="position value, USD" />
                <Col name="change_usd" desc="change vs prior period, USD" />
                <Col name="status" desc="new / increased / decreased / …" />
              </dl>
            </div>
            <p className="text-xs text-slate-400">
              Large lists take a while and are bounded by SEC rate limits.
            </p>
          </div>
        </details>

        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900">
            <span>If a name isn&apos;t found</span>
            <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p>
              Managers are matched against EDGAR&apos;s <em>registered</em> filer name, which is often
              spelled differently from a trade name — e.g.{" "}
              <span className="font-mono text-xs">WILLIAM BLAIR &amp; CO</span> is registered as{" "}
              <span className="font-mono text-xs">WILLIAM BLAIR INVESTMENT MANAGEMENT, LLC</span>.
            </p>
            <p>
              Rather than risk attributing the wrong firm&apos;s holdings, unresolved names are marked{" "}
              <span className="font-medium">Not found</span> and left out of the screening sheet.
            </p>
            <p>
              For each, we look up a few{" "}
              <span className="font-medium">possible registered names</span> — shown in the table
              below and in the exported <span className="font-medium">Unmatched</span> sheet — so you
              can fix the spelling in your list and re-run (or use{" "}
              <span className="font-medium">Retry failures</span>).
            </p>
          </div>
        </details>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          Choose CSV…
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {fileName && (
          <span className="text-sm text-slate-500">
            {fileName} · {fullNumber(total)} managers
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!running ? (
            <button
              type="button"
              onClick={start}
              disabled={total === 0 || processed === total}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
            >
              {processed > 0 && processed < total ? "Resume" : "Run screening"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={retryFailures}
            disabled={running || failures === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Retry failures ({failures})
          </button>
          <button
            type="button"
            onClick={exportXlsx}
            disabled={exporting || exportRows.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            {exporting ? "Preparing…" : "Save as Excel"}
          </button>
          {total > 0 && (
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!storageOk && total > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Results are too large to checkpoint to local storage; progress won&apos;t survive a page
          reload. Export to Excel periodically.
        </p>
      )}

      {/* Progress */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {fullNumber(processed)} / {fullNumber(total)} processed
              {running ? " · running…" : ""}
            </span>
            <span>{fullNumber(exportRows.length)} fund rows</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${pctDone}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(STATUS_LABEL) as ScreenStatus[]).map((s) => (
              <div key={s} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">{STATUS_LABEL[s]}</div>
                <div className="text-lg font-semibold text-slate-900">{fullNumber(counts[s])}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live preview of most recent managers */}
      {recent.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Most recent</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Manager</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">As of</th>
                  <th className="px-3 py-2 text-right">Funds</th>
                  <th className="px-3 py-2 text-right">Total aum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((r) => {
                  const aum = r.rows?.reduce((s, x) => s + x.aum, 0) ?? 0;
                  return (
                    <tr key={r.query} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800">
                        {r.cik ? (
                          <Link href={`/company/${r.cik}/funds`} className="hover:underline">
                            {r.matchedName ?? r.query}
                          </Link>
                        ) : (
                          r.query
                        )}
                        {r.matchedName && r.matchedName.toLowerCase() !== r.query.toLowerCase() && (
                          <span className="ml-2 text-xs text-slate-400">(from “{r.query}”)</span>
                        )}
                        {r.status === "notfound" && (r.suggestions?.length ?? 0) > 0 && (
                          <div className="mt-1 text-xs text-slate-500">
                            Did you mean:{" "}
                            {r.suggestions!.map((s, i) => (
                              <span key={s.cik}>
                                {i > 0 && ", "}
                                <Link href={`/company/${s.cik}/funds`} className="text-blue-600 hover:underline">
                                  {s.name}
                                </Link>
                              </span>
                            ))}
                            ?
                          </div>
                        )}
                        {r.status === "notfound" && (r.suggestions?.length ?? 0) === 0 && (
                          <div className="mt-1 text-xs text-slate-400">No close matches found.</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            r.status === "ok"
                              ? "bg-green-100 text-green-800"
                              : r.status === "error"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">{r.asof ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {r.rows ? fullNumber(r.rows.length) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {aum ? `$${compactNumber(aum)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {n}
        </span>
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{children}</p>
    </div>
  );
}

function Col({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <code className="rounded bg-slate-100 px-1 font-mono text-xs text-slate-700">{name}</code>
      <span className="text-xs text-slate-500">{desc}</span>
    </div>
  );
}
