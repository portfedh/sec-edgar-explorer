"use client";

import { useState } from "react";
import Link from "next/link";
import SearchBar, { type Mode } from "@/components/SearchBar";

const POPULAR_COMPANIES = [
  { cik: "0000320193", name: "Apple Inc.", note: "AAPL" },
  { cik: "0000789019", name: "Microsoft Corp.", note: "MSFT" },
  { cik: "0001652044", name: "Alphabet Inc.", note: "GOOGL" },
  { cik: "0001018724", name: "Amazon.com Inc.", note: "AMZN" },
  { cik: "0001326801", name: "Meta Platforms Inc.", note: "META" },
  { cik: "0001318605", name: "Tesla Inc.", note: "TSLA" },
];

const POPULAR_MANAGERS = [
  { cik: "0001540235", name: "Creative Planning", note: "ETF-heavy RIA" },
  { cik: "0001067983", name: "Berkshire Hathaway", note: "Warren Buffett · value" },
  { cik: "0001037389", name: "Renaissance Technologies", note: "Quant / systematic" },
  { cik: "0001350694", name: "Bridgewater Associates", note: "Ray Dalio · global macro" },
  { cik: "0001423053", name: "Citadel Advisors", note: "Ken Griffin · multi-strategy" },
  { cik: "0001649339", name: "Scion Asset Management", note: "Michael Burry" },
];

export default function HomeSearch() {
  const [mode, setMode] = useState<Mode>("company");
  const isManager = mode === "manager";
  const examples = isManager ? POPULAR_MANAGERS : POPULAR_COMPANIES;

  return (
    <div>
      <section className="mt-8">
        <SearchBar autoFocus mode={mode} onModeChange={setMode} />
        <p className="mt-2 text-center text-sm text-slate-500">
          or{" "}
          <Link href="/search" className="text-blue-600 underline">
            search the full text of all filings
          </Link>
          {isManager && (
            <>
              {" · "}
              <Link href="/screen" className="text-blue-600 underline">
                batch-screen a list of managers
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {isManager ? "Popular investment managers" : "Popular companies"}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {examples.map((c) => (
            <Link
              key={c.cik}
              href={`/company/${c.cik}`}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
            >
              <div className="font-medium text-slate-800">{c.name}</div>
              <div
                className={`mt-1 text-xs text-slate-500 ${
                  isManager ? "" : "font-mono"
                }`}
              >
                {c.note}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
