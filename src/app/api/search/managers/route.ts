import { NextRequest, NextResponse } from "next/server";
import { searchManagers } from "@/lib/sec";

// GET /api/search/managers?q=renaissance  -> institutional 13F-filer autocomplete
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const results = await searchManagers(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
