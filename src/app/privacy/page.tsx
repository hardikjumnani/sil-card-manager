import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy Policy · Scaler Business Cards Manager" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Scaler Business Cards Manager lets you upload photos of business cards, turns them into contact details and organises
        them into events that you can share with your team.
      </p>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <b>From your Google account</b>: when you sign in, we get your name, email address and profile picture.
            We use them only to identify you inside the app. We do not access your Gmail, Drive, Contacts or any other
            Google data.
          </li>
          <li>
            <b>Card photos you upload</b>, and the contact details we read from them.
          </li>
          <li>
            <b>Activity records</b>: which events you belong to and who added each contact.
          </li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To show the extracted contacts to you and to the other members of the event.</li>
          <li>
            To read the card details, card images are sent to an AI vision service (Google Gemini, or Groq as a backup).
            They are used only to process that request.
          </li>
          <li>We do not sell your data, and we do not use it for advertising.</li>
        </ul>
      </section>
      <section>
        <h2>Where it is stored</h2>
        <p>
          Data is stored in a managed database and private file storage (Supabase). The app is hosted on Vercel. Only
          signed-in members of an event can see that event&apos;s cards and contacts.
        </p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>
          Event owners can delete contacts, images or whole events at any time, and that removes them permanently. To
          have your account deleted, contact the app administrator.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>If you have questions about this policy, contact the administrator who invited you to the app.</p>
      </section>
    </LegalPage>
  );
}
