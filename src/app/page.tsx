import Link from "next/link";
import SearchBar from "@/components/SearchBar";

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
    </div>
  );
}
