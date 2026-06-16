import HomeSearch from "@/components/HomeSearch";
import { PROVIDERS, OTHER_FUND } from "@/lib/fund-providers";

// Common EDGAR form codes, grouped so the list is scannable. Each item is
// [code, what it is].
const FILING_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Periodic & current reports",
    items: [
      ["10-K", "Annual report — audited financials and a full review of the business and its risks."],
      ["10-Q", "Quarterly report — unaudited financials for the first three fiscal quarters."],
      ["8-K", "Current report — material events (earnings, M&A, leadership changes) filed as they happen."],
    ],
  },
  {
    title: "Foreign private issuers",
    items: [
      ["20-F", "Annual report for foreign private issuers — the 10-K equivalent."],
      ["40-F", "Annual report for eligible Canadian issuers."],
      ["6-K", "Interim report foreign issuers furnish for material updates during the year."],
    ],
  },
  {
    title: "Proxies & shareholder votes",
    items: [
      ["DEF 14A", "Definitive proxy statement — annual meeting, board, and executive-pay details."],
      ["PRE 14A", "Preliminary proxy statement, filed before the definitive version."],
      ["DEFA14A", "Additional proxy soliciting materials."],
    ],
  },
  {
    title: "Registration & offerings",
    items: [
      ["S-1", "Registration statement for an IPO or newly offered securities."],
      ["S-3", "Streamlined registration for established, seasoned issuers."],
      ["S-4", "Registration for mergers, acquisitions, and exchange offers."],
      ["S-8", "Registration of shares issued under employee benefit plans."],
      ["424B", "Final prospectus, filed once a registration becomes effective."],
    ],
  },
  {
    title: "Insider & beneficial ownership",
    items: [
      ["3 / 4 / 5", "Insider holdings of officers, directors, and >10% owners — 3 initial, 4 changes, 5 annual."],
      ["SC 13D", "Stake above 5% with activist / control intent — detailed, with a tight deadline."],
      ["SC 13G", "Stake above 5% held passively (index funds, passive institutions)."],
    ],
  },
  {
    title: "Institutional holdings (13F)",
    items: [
      ["13F-HR", "Quarterly holdings report listing an institution's positions — what this app parses."],
      ["13F-NT", "Notice — holdings are reported by another manager, so this filing has none."],
      ["13F-HR/A", "Amendment to a holdings report."],
    ],
  },
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

      <HomeSearch />

      <section className="mt-10">
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
            What these filings mean
          </summary>
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              EDGAR identifies every filing by a short form code. The most common ones, by purpose:
            </p>
            <div className="mt-3 space-y-5">
              {FILING_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.title}
                  </h3>
                  <dl className="mt-1 divide-y divide-slate-100">
                    {group.items.map(([code, desc]) => (
                      <div key={code} className="flex gap-3 py-1.5">
                        <dt className="w-24 shrink-0">
                          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700">
                            {code}
                          </span>
                        </dt>
                        <dd className="text-sm text-slate-600">{desc}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">Tip:</span> any form ending in “/A” is an
              amendment to a prior filing of that type. Mental model: 10-K / 10-Q / 8-K = a company
              reporting on itself; 13D / 13G = who owns more than 5% of one company (13G passive, 13D
              activist); 13F = everything an institution owns each quarter.
            </p>
          </div>
        </details>
      </section>

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
