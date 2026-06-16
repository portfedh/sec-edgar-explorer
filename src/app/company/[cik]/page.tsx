import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, SecError } from "@/lib/sec";
import CompanyHeader from "@/components/CompanyHeader";
import CompanyTabs from "@/components/CompanyTabs";

export const revalidate = 3600;

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ cik: string }>;
}) {
  const { cik } = await params;

  let data;
  try {
    data = await getCompany(cik, true);
  } catch (err) {
    if (err instanceof SecError && err.status === 404) {
      notFound();
    }
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-red-700">
        <p className="font-medium">Could not load this company.</p>
        <p className="mt-1 text-sm">
          {err instanceof Error ? err.message : "Unknown error"}
        </p>
        <Link href="/" className="mt-3 inline-block text-sm text-blue-600 underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Search
      </Link>
      <div className="mt-3">
        <CompanyHeader profile={data.profile} />
        {data.filings.filter((f) => f.form === "13F-HR").length >= 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.filings.filter((f) => f.form === "13F-HR").length >= 2 && (
              <Link
                href={`/company/${data.profile.cik}/compare`}
                className="inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-blue-600 shadow-sm hover:bg-slate-50"
              >
                Compare 13F holdings between periods →
              </Link>
            )}
            <Link
              href={`/company/${data.profile.cik}/funds`}
              className="inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-blue-600 shadow-sm hover:bg-slate-50"
            >
              Funds &amp; ETF providers →
            </Link>
          </div>
        )}
        <CompanyTabs cik={data.profile.cik} filings={data.filings} />
      </div>
    </div>
  );
}
