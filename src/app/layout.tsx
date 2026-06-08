import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EDGAR Browser — SEC Company Filings",
  description:
    "Search and browse SEC EDGAR company filings, financials, and full-text search. Unofficial viewer built on the SEC's public data APIs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="rounded bg-blue-600 px-2 py-1 text-sm text-white">
                EDGAR
              </span>
              <span className="text-slate-700">Browser</span>
            </Link>
            <nav className="ml-auto flex items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-blue-600">
                Search
              </Link>
              <Link href="/search" className="hover:text-blue-600">
                Full-text
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
            Data sourced from the{" "}
            <a
              className="underline hover:text-blue-600"
              href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
              target="_blank"
              rel="noreferrer"
            >
              SEC EDGAR public APIs
            </a>
            . This is an unofficial viewer and is not affiliated with or endorsed by the
            U.S. Securities and Exchange Commission.
          </div>
        </footer>
      </body>
    </html>
  );
}
