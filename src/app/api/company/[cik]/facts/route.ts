import { NextRequest, NextResponse } from "next/server";
import { getCompanyFacts, extractMetrics, SecError } from "@/lib/sec";

// GET /api/company/:cik/facts  -> curated financial metric time series
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ cik: string }> },
) {
  const { cik } = await ctx.params;
  try {
    const facts = await getCompanyFacts(cik);
    const metrics = extractMetrics(facts);
    return NextResponse.json({ entityName: facts.entityName, metrics });
  } catch (err) {
    if (err instanceof SecError && err.status === 404) {
      return NextResponse.json(
        { error: "No XBRL financial data available for this company" },
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
