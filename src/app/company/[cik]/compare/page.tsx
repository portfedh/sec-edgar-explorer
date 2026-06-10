import Link from "next/link";
import { getCompany, SecError } from "@/lib/sec";
import { getThirteenF, compareHoldings } from "@/lib/holdings";
import { padCik } from "@/lib/cik";
import HoldingsDiff from "@/components/HoldingsDiff";

export const revalidate = 86400;

export default async function ComparePage({
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

  if (filings.length < 2) {
    return (
      <ErrorCard
        cik={cik}
        message={`${company.profile.name} has ${filings.length} 13F-HR filing(s); at least two are needed to compare periods.`}
      />
    );
  }

  // Default `to` = latest; default `from` = the period immediately older than
  // `to` (filings are newest-first), so the viewer's "Compare periods" link
  // sensibly diffs a filing against its predecessor.
  const toAcc = to || filings[0].accessionNumber;
  const toIdx = Math.max(0, filings.findIndex((f) => f.accessionNumber === toAcc));
  const fromAcc =
    from || filings[toIdx + 1]?.accessionNumber || filings[toIdx === 0 ? 1 : 0].accessionNumber;

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

  if (!fromData || !toData) {
    return (
      <ErrorCard
        cik={cik}
        message="One of the selected filings has no holdings table to compare."
      />
    );
  }

  const diff = compareHoldings(fromData, toData);

  return (
    <div>
      <Link href={`/company/${cik}`} className="text-sm text-blue-600 hover:underline">
        ← {company.profile.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Compare 13F holdings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Position changes between two reporting periods, matched by CUSIP.
      </p>
      <div className="mt-4">
        <HoldingsDiff
          cik={cik}
          options={options}
          fromAcc={fromAcc}
          toAcc={toAcc}
          fromPeriod={fromData.period}
          toPeriod={toData.period}
          diff={diff}
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
