import { NextRequest, NextResponse } from "next/server";
import { fullTextSearch } from "@/lib/sec";

// GET /api/search/fulltext?q=...&forms=10-K&startdt=...&enddt=...&from=0
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  try {
    const result = await fullTextSearch({
      q,
      forms: sp.get("forms") ?? undefined,
      startdt: sp.get("startdt") ?? undefined,
      enddt: sp.get("enddt") ?? undefined,
      from: sp.get("from") ? Number(sp.get("from")) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
