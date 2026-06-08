import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/tickers";

// GET /api/search/companies?q=apple  -> ticker/name autocomplete
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const results = await searchCompanies(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
