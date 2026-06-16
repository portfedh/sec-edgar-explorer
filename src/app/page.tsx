import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import { PROVIDERS, OTHER_FUND } from "@/lib/fund-providers";

const POPULAR = [
  { cik: "0000320193", name: "Apple Inc.", ticker: "AAPL" },
  { cik: "0000789019", name: "Microsoft Corp.", ticker: "MSFT" },
  { cik: "0001652044", name: "Alphabet Inc.", ticker: "GOOGL" },
  { cik: "0001018724", name: "Amazon.com Inc.", ticker: "AMZN" },
  { cik: "0001326801", name: "Meta Platforms Inc.", ticker: "META" },
  { cik: "0001318605", name: "Tesla Inc.", ticker: "TSLA" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="mt-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Browse SEC company filings
        </h1>
        <p className="mt-3 text-slate-600">
          Search any public company to view its profile, filing history (10-K, 10-Q, 8-K
          and more), and financials — straight from SEC EDGAR.
        </p>
      </section>

      <section className="mt-8">
        <SearchBar autoFocus />
        <p className="mt-2 text-center text-sm text-slate-500">
          or{" "}
          <Link href="/search" className="text-blue-600 underline">
            search the full text of all filings
          </Link>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Popular companies
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {POPULAR.map((c) => (
            <Link
              key={c.cik}
              href={`/company/${c.cik}`}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
            >
              <div className="font-medium text-slate-800">{c.name}</div>
              <div className="mt-1 font-mono text-xs text-slate-500">{c.ticker}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
            13F fund-provider classification ({PROVIDERS.length} providers · audit)
          </summary>
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              The Funds &amp; ETF providers view detects ETF/fund holdings by matching each
              brand-name pattern below against the issuer name reported in a 13F. Recognized funds
              with no matching brand are grouped as “{OTHER_FUND}”; everything else is treated as an
              individual security.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Issuer-name patterns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PROVIDERS.map((p) => (
                    <tr key={p.provider}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                        {p.provider}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {p.patterns.map((re) => re.source).join("  ·  ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
