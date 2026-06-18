import HomeSearch from "@/components/HomeSearch";
import FilingFormGuide from "@/components/FilingFormGuide";
import { PROVIDERS, OTHER_FUND } from "@/lib/fund-providers";

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

      <HomeSearch />

      <FilingFormGuide />

      <section className="mt-4">
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
            13F fund-provider classification
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

      <section className="mt-4">
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
            How tickers are resolved (OpenFIGI)
          </summary>
          <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p>
              13F holdings identify each security only by its{" "}
              <span className="font-medium text-slate-800">CUSIP</span> — a licensed 9-character
              identifier — never by ticker. To show a familiar ticker, the app maps CUSIP → ticker
              through{" "}
              <a
                href="https://www.openfigi.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                OpenFIGI
              </a>
              , a free service operated by Bloomberg and built on the open FIGI standard.
            </p>
            <p>
              Lookups are <span className="font-medium text-slate-800">best-effort and cached</span>.
              U.S.-listed stocks and ETFs resolve reliably, but some foreign issuers, share classes,
              and non-equity instruments have no clean match — those rows simply show no ticker, with
              the CUSIP still displayed.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
