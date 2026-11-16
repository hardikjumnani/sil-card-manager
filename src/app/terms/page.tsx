import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of Service · SIL Card Manager" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>By signing in to SIL Card Manager you agree to these terms.</p>
      <section>
        <h2>Use of the service</h2>
        <ul>
          <li>Use the app only to manage business cards that you have received legitimately.</li>
          <li>You are responsible for the content you upload, and for whom you add to your events.</li>
          <li>Don&apos;t attempt to access events or data you have not been invited to.</li>
        </ul>
      </section>
      <section>
        <h2>Accuracy</h2>
        <p>
          Contact details are read from card photos automatically by AI. They may contain mistakes, so review
          important details before you rely on them.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          The service is provided &quot;as is&quot;, with no warranty. It may change or be unavailable at times, and AI
          processing may be delayed when free usage limits are reached.
        </p>
      </section>
      <section>
        <h2>Termination</h2>
        <p>Access may be removed for misuse. Event owners control who can access their events.</p>
      </section>
      <section>
        <h2>Privacy</h2>
        <p>
          See our <a href="/privacy" className="text-indigo-700 hover:underline">Privacy Policy</a> for how we handle
          data.
        </p>
      </section>
    </LegalPage>
  );
}
