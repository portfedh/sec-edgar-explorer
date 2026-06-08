import { Suspense } from "react";
import FullTextSearch from "@/components/FullTextSearch";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
      <FullTextSearch />
    </Suspense>
  );
}
