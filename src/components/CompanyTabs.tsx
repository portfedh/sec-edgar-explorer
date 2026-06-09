"use client";

import { useState } from "react";
import type { Filing } from "@/lib/types";
import FilingsTable from "./FilingsTable";
import FinancialsView from "./FinancialsView";

type Tab = "filings" | "financials";

export default function CompanyTabs({
  cik,
  filings,
}: {
  cik: string;
  filings: Filing[];
}) {
  const [tab, setTab] = useState<Tab>("filings");

  return (
    <div className="mt-6">
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "filings"} onClick={() => setTab("filings")}>
          Filings
        </TabButton>
        <TabButton active={tab === "financials"} onClick={() => setTab("financials")}>
          Financials
        </TabButton>
      </div>

      {tab === "filings" ? (
        <FilingsTable cik={cik} filings={filings} />
      ) : (
        <FinancialsView cik={cik} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
