import type { CompanyProfile } from "@/lib/types";
import { fiscalYearEnd } from "@/lib/format";

export default function CompanyHeader({ profile }: { profile: CompanyProfile }) {
  const biz = profile.addresses?.business;
  const addressParts = biz
    ? [biz.street1, biz.street2, biz.city, biz.stateOrCountry, biz.zipCode]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {profile.tickers.map((t, i) => (
              <span
                key={t}
                className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-medium text-blue-800"
              >
                {t}
                {profile.exchanges[i] ? ` · ${profile.exchanges[i]}` : ""}
              </span>
            ))}
          </div>
        </div>
        <a
          href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${profile.cik}&type=&dateb=&owner=include&count=40`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-blue-600 underline"
        >
          View on SEC.gov ↗
        </a>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Item label="CIK" value={profile.cik} mono />
        <Item label="Industry (SIC)" value={profile.sicDescription || profile.sic || "—"} />
        <Item label="Fiscal year end" value={fiscalYearEnd(profile.fiscalYearEnd)} />
        <Item label="Entity type" value={profile.entityType || "—"} />
        <Item label="State of incorp." value={profile.stateOfIncorporation || "—"} />
        <Item
          label="Website"
          value={
            profile.website ? (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                {profile.website}
              </a>
            ) : (
              "—"
            )
          }
        />
        {addressParts && (
          <div className="col-span-2 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Address</dt>
            <dd className="mt-0.5 text-slate-700">{addressParts}</dd>
          </div>
        )}
      </dl>

      {profile.formerNames.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Formerly: {profile.formerNames.map((f) => f.name).join("; ")}
        </p>
      )}
    </div>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
