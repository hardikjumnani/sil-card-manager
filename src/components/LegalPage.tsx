import Link from "next/link";
import { ContactRound } from "lucide-react";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-slate-700 sm:px-6">
      <Link href="/login" className="mb-8 flex items-center gap-2 font-semibold text-indigo-700">
        <ContactRound size={20} /> SIL Card Manager
      </Link>
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: 16 November 2026</p>
      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
      <p className="mt-12 flex gap-4 text-sm">
        <Link href="/privacy" className="text-indigo-700 hover:underline">Privacy Policy</Link>
        <Link href="/terms" className="text-indigo-700 hover:underline">Terms of Service</Link>
      </p>
    </main>
  );
}
