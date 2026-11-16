import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ContactRound, FileSpreadsheet, ScanLine, Users } from "lucide-react";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect("/events");
  const { error, callbackUrl } = await searchParams;
  const redirectTo = callbackUrl?.startsWith("/") ? callbackUrl : "/events";

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="flex flex-1 flex-col justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-12 text-white sm:px-12">
        <div className="mx-auto max-w-md">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
            <ContactRound /> SIL Card Manager
          </div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Turn stacks of business cards into a clean spreadsheet.</h1>
          <ul className="mt-8 space-y-4 text-indigo-100">
            <li className="flex gap-3"><ScanLine className="shrink-0" /> Upload dozens of cards at once. AI reads every detail on them.</li>
            <li className="flex gap-3"><Users className="shrink-0" /> Collect cards together with your team, event by event.</li>
            <li className="flex gap-3"><FileSpreadsheet className="shrink-0" /> Paste into Google Sheets in one click, or download Excel.</li>
          </ul>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your Google account to continue.</p>
          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error === "AccessDenied"
                ? "This Google account isn't allowed to sign in here. Use your work account."
                : "Sign-in failed. Please try again."}
            </div>
          )}
          <form
            className="mt-8"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">
            By continuing you agree to our{" "}
            <a href="/terms" className="underline hover:text-slate-700">Terms</a> and{" "}
            <a href="/privacy" className="underline hover:text-slate-700">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
