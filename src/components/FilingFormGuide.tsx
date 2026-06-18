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

export default function FilingFormGuide({
  className = "mt-10",
}: {
  className?: string;
}) {
  return (
    <section className={className}>
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
  );
}
