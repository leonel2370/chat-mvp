import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How CHAT collects, uses and protects your data, in line with the GDPR.'
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@your-domain.com';
const EFFECTIVE_DATE = '1 July 2022';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="h-16 px-4 sm:px-6 flex items-center border-b border-line">
        <Link href="/" className="text-[22px] text-ink-muted">CHAT</Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10 leading-7 text-ink-muted">
        <h1 className="text-3xl font-medium text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm">Effective date: {EFFECTIVE_DATE}</p>

        <p className="mt-6">
          This Privacy Policy explains how CHAT (&ldquo;we&rdquo;, &ldquo;us&rdquo;) processes personal
          data when you use our free random video chat service (the &ldquo;Service&rdquo;). We are
          committed to protecting your privacy in accordance with the EU General Data Protection
          Regulation (GDPR) and applicable data protection laws.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">1. Who we are</h2>
        <p className="mt-2">
          The data controller is the operator of this website. For any privacy request, contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">2. Data we process</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">No account.</strong> The Service requires no registration; we do not ask for your name, email or phone number to use it.</li>
          <li><strong className="text-ink">Connection data.</strong> Your IP address and browser information are processed transiently to establish the connection and to prevent abuse (rate limiting, moderation).</li>
          <li><strong className="text-ink">Video and audio.</strong> Calls are peer-to-peer between participants. We do <strong className="text-ink">not</strong> record, store, watch or listen to your video or audio.</li>
          <li><strong className="text-ink">Reports.</strong> If you report another user, we temporarily store a short record (truncated identifiers, the reason and a timestamp) for safety and moderation.</li>
          <li><strong className="text-ink">Browser storage.</strong> Your acceptance of the Terms, your cookie choice and interface preferences are stored locally in your browser only.</li>
          <li><strong className="text-ink">Advertising cookies.</strong> If you consent, our advertising partner may set cookies to deliver and measure ads.</li>
        </ul>

        <h2 className="mt-8 text-xl font-medium text-ink">3. Purposes and legal bases</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Providing the Service — performance of a contract (Art. 6(1)(b) GDPR).</li>
          <li>Security and abuse prevention — our legitimate interests (Art. 6(1)(f)).</li>
          <li>Advertising and related cookies — your consent (Art. 6(1)(a)).</li>
          <li>Compliance with legal obligations (Art. 6(1)(c)).</li>
        </ul>

        <h2 className="mt-8 text-xl font-medium text-ink">4. Third parties</h2>
        <p className="mt-2">
          We use a connection (STUN/TURN) provider to route calls, a hosting provider to run the
          Service, and an advertising network (ExoClick) which, subject to your consent, may process
          data through cookies. These providers may process data outside your country; where required,
          appropriate safeguards are applied. We never sell your personal data.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">5. Cookies and consent</h2>
        <p className="mt-2">
          Essential storage needed to run the site is always active. Non-essential (advertising)
          cookies are only set after you accept them in the consent banner. You can decline, and you
          can change your choice at any time by clearing your browser storage.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">6. Data retention</h2>
        <p className="mt-2">
          Connection data is processed transiently and not stored beyond what is needed to run and
          secure the session. Reports are kept only for a limited time for moderation. Data stored in
          your browser remains until you delete it.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">7. Your rights</h2>
        <p className="mt-2">
          Under the GDPR you have the right to access, rectify, erase, restrict or object to the
          processing of your data, to data portability, and to withdraw consent at any time. You may
          also lodge a complaint with your local supervisory authority. To exercise these rights,
          contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">8. Children</h2>
        <p className="mt-2">
          The Service is strictly for adults aged 18 or older. It is not directed at children, and we
          do not knowingly process data of minors.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">9. Changes</h2>
        <p className="mt-2">
          We may update this policy. Material changes will be indicated by updating the effective date
          above.
        </p>

        <p className="mt-10 border-t border-line pt-6 text-sm">
          See also our <Link href="/terms" className="text-primary">Terms of Service</Link>. Return to{' '}
          <Link href="/" className="text-primary">CHAT</Link>.
        </p>
      </main>
    </div>
  );
}
