import Link from "next/link";
import { getCompany, SecError } from "@/lib/sec";
import { getThirteenF, fundBreakdown, compareFundBreakdown } from "@/lib/holdings";
import { padCik } from "@/lib/cik";
import FundsBreakdown from "@/components/FundsBreakdown";

export const revalidate = 86400;

export default async function FundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cik: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { cik: cikParam } = await params;
  const { from, to } = await searchParams;
  const cik = padCik(cikParam);

  let company;
  try {
    company = await getCompany(cik, true);
  } catch (err) {
    if (err instanceof SecError && err.status === 404) {
      return <ErrorCard cik={cik} message="Company not found." />;
    }
    return (
      <ErrorCard cik={cik} message={err instanceof Error ? err.message : "Could not load."} />
    );
  }

  // The manager's 13F holdings reports, newest first (getCompany returns sorted).
  const filings = company.filings.filter((f) => f.form === "13F-HR");
  const options = filings.map((f) => ({
    accession: f.accessionNumber,
    label: f.reportDate || f.filingDate,
  }));

  if (filings.length < 1) {
    return (
      <ErrorCard
        cik={cik}
        message={`${company.profile.name} has no 13F-HR filings with a holdings table to analyze.`}
      />
    );
  }

  // Default `to` = latest. Default `from` = the period immediately older than
  // `to`; when there's only one filing, `from` falls back to `to` (a single-period
  // view with zero deltas).
  const toAcc = to || filings[0].accessionNumber;
  const toIdx = Math.max(0, filings.findIndex((f) => f.accessionNumber === toAcc));
  const fromAcc = from || filings[toIdx + 1]?.accessionNumber || toAcc;

  let fromData;
  let toData;
  try {
    [fromData, toData] = await Promise.all([
      getThirteenF(cik, fromAcc),
      getThirteenF(cik, toAcc),
    ]);
  } catch (err) {
    return (
      <ErrorCard cik={cik} message={err instanceof Error ? err.message : "Could not load filings."} />
    );
  }

  if (!toData) {
    return (
      <ErrorCard
        cik={cik}
        message="The selected filing has no holdings table to analyze."
      />
    );
  }

  // When `from` has no holdings (e.g. a 13F-NT predecessor), compare `to` against
  // itself so the page still renders a single-period breakdown.
  const effectiveFrom = fromData ?? toData;
  const breakdown = fundBreakdown(toData);
  const comparison = compareFundBreakdown(effectiveFrom, toData);

  return (
    <div>
      <Link href={`/company/${cik}`} className="text-sm text-blue-600 hover:underline">
        ← {company.profile.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Funds &amp; ETF providers</h1>
      <p className="mt-1 text-sm text-slate-500">
        ETF / pooled-fund holdings grouped by provider, with each vendor&apos;s share of the
        portfolio and how it changed between periods.
      </p>
      <div className="mt-4">
        <FundsBreakdown
          cik={cik}
          name={company.profile.name}
          options={options}
          fromAcc={fromAcc}
          toAcc={toAcc}
          fromPeriod={effectiveFrom.period}
          toPeriod={toData.period}
          comparison={comparison}
          breakdown={breakdown}
        />
      </div>
    </div>
  );
}

function ErrorCard({ cik, message }: { cik: string; message: string }) {
  return (
    <div>
      <Link href={`/company/${cik}`} className="text-sm text-blue-600 hover:underline">
        ← Back to company
      </Link>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-amber-800">
        {message}
      </div>
    </div>
  );
}
