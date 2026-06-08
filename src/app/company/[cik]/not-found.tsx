import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-slate-800">Company not found</h2>
      <p className="mt-2 text-sm text-slate-500">
        No EDGAR record matched that CIK. Try searching by name or ticker instead.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
      >
        ← Back to search
      </Link>
    </div>
  );
}
