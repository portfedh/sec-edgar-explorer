import { NextRequest, NextResponse } from "next/server";
import { resolveTickers } from "@/lib/cusip-tickers";

// POST /api/tickers  { cusips: string[] }  ->  { tickers: { [cusip]: ticker } }
// Resolves CUSIP→ticker via OpenFIGI (cached server-side). Degrades to an empty
// map on error so the UI shows no ticker rather than breaking.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { cusips?: unknown };
    const cusips = Array.isArray(body.cusips)
      ? body.cusips.filter((c): c is string => typeof c === "string").slice(0, 120)
      : [];
    if (cusips.length === 0) {
      return NextResponse.json({ tickers: {} });
    }
    const tickers = await resolveTickers(cusips);
    return NextResponse.json({ tickers });
  } catch {
    return NextResponse.json({ tickers: {} });
  }
}
