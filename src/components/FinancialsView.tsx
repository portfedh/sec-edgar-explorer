"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { MetricSeries } from "@/lib/types";
import { compactNumber, fullNumber } from "@/lib/format";

export default function FinancialsView({ cik }: { cik: string }) {
  const [metrics, setMetrics] = useState<MetricSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setMetrics(null);
    setError(null);
    fetch(`/api/company/${cik}/facts`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to load financials");
          return;
        }
        setMetrics(data.metrics);
        if (data.metrics?.length) setSelected(data.metrics[0].tag);
      })
      .catch(() => !cancelled && setError("Failed to load financials"));
    return () => {
      cancelled = true;
    };
  }, [cik]);

  const current = useMemo(
    () => metrics?.find((m) => m.tag === selected),
    [metrics, selected],
  );

  const chartData = useMemo(
    () =>
      current?.points.map((p) => ({
        period: p.period,
        value: p.val,
      })) ?? [],
    [current],
  );

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-amber-800">
        {error}
      </div>
    );
  }

  if (!metrics) {
    return <div className="py-10 text-center text-slate-400">Loading financials…</div>;
  }

  if (metrics.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
        No standardized XBRL financial data is available for this company.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {metrics.map((m) => (
          <button
            key={m.tag}
            onClick={() => setSelected(m.tag)}
            className={`rounded-full border px-3 py-1 text-sm ${
              m.tag === selected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-blue-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {current && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-1 text-sm font-medium text-slate-700">
              {current.label}{" "}
              <span className="font-normal text-slate-400">({current.unit}, annual)</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis
                    tickFormatter={(v) => compactNumber(v as number)}
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    width={60}
                  />
                  <Tooltip
                    formatter={(v) => fullNumber(v as number)}
                    labelStyle={{ color: "#0f172a" }}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fiscal year</th>
                  <th className="px-3 py-2">Period end</th>
                  <th className="px-3 py-2 text-right">{current.label}</th>
                  <th className="px-3 py-2">Form</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...current.points].reverse().map((p) => (
                  <tr key={p.period} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{p.period}</td>
                    <td className="px-3 py-2 text-slate-500">{p.end}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {fullNumber(p.val)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{p.form}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
