import { NextRequest, NextResponse } from "next/server";
import { parseCik, accessionNoDashes } from "@/lib/cik";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "EDGAR Browser (set SEC_USER_AGENT) example@example.com";

const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
// Allow letters, digits, dot, underscore, dash and a single level of subfolder.
const DOC_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

// GET /api/filing/raw?cik=&accession=&doc=&download=0|1
// Streams a filing document's bytes from sec.gov through our origin (so PDFs can
// be embedded despite sec.gov's x-frame-options, and to support downloads).
// The upstream URL is built ONLY from validated params to avoid SSRF.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cikRaw = sp.get("cik") ?? "";
  const accession = sp.get("accession") ?? "";
  const doc = sp.get("doc") ?? "";
  const download = sp.get("download") === "1";

  const cik = parseCik(cikRaw);
  if (!cik || !ACCESSION_RE.test(accession) || !DOC_RE.test(doc) || doc.includes("..")) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes(
    accession,
  )}/${doc}`;

  const upstream = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 86400 },
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Failed to fetch document (${upstream.status})` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
  });
  if (download) {
    const filename = doc.split("/").pop() || "filing";
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
