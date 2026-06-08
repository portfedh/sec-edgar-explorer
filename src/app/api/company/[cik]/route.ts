import { NextRequest, NextResponse } from "next/server";
import { getCompany, SecError } from "@/lib/sec";

// GET /api/company/:cik?all=1  -> profile + normalized filings
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ cik: string }> },
) {
  const { cik } = await ctx.params;
  const includeAll = req.nextUrl.searchParams.get("all") === "1";
  try {
    const data = await getCompany(cik, includeAll);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SecError && err.status === 404) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
