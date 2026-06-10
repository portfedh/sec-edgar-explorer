import Link from "next/link";
import { loadFilingHtml } from "@/lib/filing-html";
import { getAdjacentFilings } from "@/lib/sec";
import { getThirteenF } from "@/lib/holdings";
import { padCik } from "@/lib/cik";
import type { Filing } from "@/lib/types";
import FilingReader from "@/components/FilingReader";
import HoldingsTable from "@/components/HoldingsTable";

export const revalidate = 86400;

function viewerHref(cik: string, f: Filing): string {
  const sp = new URLSearchParams({
    accession: f.accessionNumber,
    doc: f.primaryDocument || "",
    form: f.form,
    date: f.filingDate,
  });
  return `/company/${cik}/filing?${sp.toString()}`;
}

export default async function FilingViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ cik: string }>;
  searchParams: Promise<{ accession?: string; doc?: string; form?: string; date?: string }>;
}) {
  const { cik: cikParam } = await params;
  const { accession, doc, form, date } = await searchParams;
  const cik = padCik(cikParam);

  if (!accession || !doc) {
    return (
      <ErrorCard cik={cik} message="This filing link is missing a document reference." />
    );
  }

  let adjacent;
  try {
    adjacent = await getAdjacentFilings(cik, accession);
  } catch (err) {
    return (
      <ErrorCard
        cik={cik}
        message={err instanceof Error ? err.message : "Could not load this filing."}
      />
    );
  }

  const effectiveForm = form || adjacent.current?.form || "";

  // 13F holdings reports: render the parsed information table instead of the
  // bare cover page. Falls through to the normal reader for notices (13F-NT)
  // that carry no holdings table.
  if (effectiveForm.startsWith("13F")) {
    const thirteenF = await getThirteenF(cik, accession).catch(() => null);
    if (thirteenF) {
      return (
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/company/${cik}`} className="text-blue-600 hover:underline">
              ← Back
            </Link>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
              {effectiveForm}
            </span>
            <span className="text-slate-500">{date || adjacent.current?.filingDate || ""}</span>
            <Link
              href={`/company/${cik}/compare?to=${accession}`}
              className="ml-auto text-blue-600 hover:underline"
            >
              Compare periods ↔
            </Link>
            {adjacent.current?.indexUrl && (
              <a
                href={adjacent.current.indexUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open full filing on SEC.gov ↗
              </a>
            )}
          </div>
          <div className="mt-4">
            <HoldingsTable data={thirteenF} />
          </div>
        </div>
      );
    }
  }

  let loaded;
  try {
    loaded = await loadFilingHtml(cik, accession, doc);
  } catch (err) {
    return (
      <ErrorCard
        cik={cik}
        message={err instanceof Error ? err.message : "Could not load this filing."}
      />
    );
  }

  const rawUrl = `/api/filing/raw?cik=${cik}&accession=${accession}&doc=${encodeURIComponent(doc)}`;
  const meta = {
    cik,
    form: effectiveForm,
    date: date || adjacent.current?.filingDate || "",
    sourceUrl: loaded.sourceUrl,
    downloadUrl: `${rawUrl}&download=1`,
    prevHref: adjacent.prev ? viewerHref(cik, adjacent.prev) : null,
    nextHref: adjacent.next ? viewerHref(cik, adjacent.next) : null,
  };

  if (loaded.kind === "html" && loaded.html) {
    return <FilingReader html={loaded.html} meta={meta} />;
  }

  if (loaded.kind === "pdf") {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col">
        <ViewerToolbar meta={meta} />
        <iframe
          src={rawUrl}
          title="Filing document"
          className="mt-3 w-full flex-1 rounded-lg border border-slate-200 bg-white"
        />
      </div>
    );
  }

  // Unknown/binary content: offer open + download.
  return (
    <div>
      <ViewerToolbar meta={meta} />
      <div className="mt-6 rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-slate-600">
        <p>This document type can&apos;t be previewed in the reader.</p>
        <div className="mt-4 flex justify-center gap-4 text-sm">
          <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            Open original on SEC.gov ↗
          </a>
          <a href={meta.downloadUrl} className="text-blue-600 underline">
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function ViewerToolbar({
  meta,
}: {
  meta: { cik: string; form: string; date: string; sourceUrl: string; downloadUrl: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link href={`/company/${meta.cik}`} className="text-blue-600 hover:underline">
        ← Back
      </Link>
      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
        {meta.form}
      </span>
      <span className="text-slate-500">{meta.date}</span>
      <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:underline">
        Open original ↗
      </a>
      <a href={meta.downloadUrl} className="text-blue-600 hover:underline">
        Download
      </a>
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
