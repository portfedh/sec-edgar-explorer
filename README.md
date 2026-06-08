# EDGAR Browser

A user-friendly web app to **search and browse SEC company filings**, built on the SEC's
free, public [EDGAR data APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
No SEC account, login, or API token required.

## Features

- **Company search** — find any public company by name or ticker (autocomplete).
- **Company profile** — name, CIK, tickers/exchanges, SIC industry, fiscal year end, address.
- **Filing browser** — full filing history (10-K, 10-Q, 8-K, Form 4, etc.) with form-type
  and keyword filters, pagination, and direct links to the documents on sec.gov.
- **Financials** — standardized XBRL metrics (revenue, net income, assets, EPS, …) shown as
  annual charts and tables.
- **Full-text search** — search the text of all EDGAR filings (2001–present), with form-type
  and date filters.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts.

All SEC requests are made **server-side** through route handlers in `src/app/api/*`, which set
the required `User-Agent` header and cache responses. The browser never calls SEC directly.

## Setup

```bash
npm install
```

SEC fair-access rules require a descriptive `User-Agent` (requests without one are blocked with
HTTP 403). Set yours in `.env.local`:

```
SEC_USER_AGENT="Your App Name your-email@example.com"
```

(A default pointing at the project owner's email is already present; change it to your own.)

## Run

```bash
npm run dev      # http://localhost:3000
npm run build && npm run start   # production
```

## Project layout

```
src/
  app/
    page.tsx                 # Home: company search + popular companies
    company/[cik]/page.tsx   # Company profile (Filings + Financials tabs)
    search/page.tsx          # Full-text search
    api/                     # Server-side SEC proxies (search, company, facts, fulltext)
  components/                # SearchBar, CompanyHeader, FilingsTable, FinancialsView, …
  lib/
    sec.ts                   # SEC client (User-Agent + caching), filings/facts/FTS
    cik.ts                   # CIK + accession-number formatting helpers
    tickers.ts               # cached ticker -> CIK index for search
    types.ts                 # shared types
    format.ts                # number/date formatters
```

## Notes & limitations

- Data comes from `data.sec.gov`, `efts.sec.gov`, and `sec.gov/Archives`; rate limited to
  ~10 req/sec (handled via server-side caching).
- Full-text search only covers filings from **2001 onward**.
- Financials use standardized US-GAAP XBRL tags; companies without XBRL data (or that use
  uncommon tags) may show limited metrics.
- This is an **unofficial** viewer and is not affiliated with the U.S. SEC.

`docs/api-overview.pdf` describes the separate **EDGAR Next *Filer* APIs** (for *submitting*
filings, requiring API tokens) — those are intentionally out of scope for this read-only browser.
