import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using CHAT, our free random video chat service.'
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@your-domain.com';
const EFFECTIVE_DATE = '1 July 2022';

export default function Terms() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="h-16 px-4 sm:px-6 flex items-center border-b border-line">
        <Link href="/" className="text-[22px] text-ink-muted">CHAT</Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10 leading-7 text-ink-muted">
        <h1 className="text-3xl font-medium text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm">Effective date: {EFFECTIVE_DATE}</p>

        <p className="mt-6">
          These Terms govern your use of CHAT (the &ldquo;Service&rdquo;), a free random video chat
          that connects you with other people. By using the Service you agree to these Terms. If you
          do not agree, do not use the Service.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">1. Eligibility</h2>
        <p className="mt-2">
          You must be at least 18 years old to use the Service. By using it, you confirm that you are
          an adult. The Service is not available to minors.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">2. The Service</h2>
        <p className="mt-2">
          CHAT pairs you at random with other users for live video and text conversation. Calls are
          peer-to-peer; we do not record them. The Service is provided for personal, lawful use only.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">3. Acceptable use</h2>
        <p className="mt-2">You agree that you will not:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>expose minors to the Service or involve anyone under 18;</li>
          <li>display nudity or sexual content to anyone who has not consented, or any illegal content;</li>
          <li>harass, threaten, defame, or discriminate against other users;</li>
          <li>record, screenshot or redistribute another person without their consent;</li>
          <li>share malware, spam, or attempt to disrupt or overload the Service;</li>
          <li>impersonate others or misrepresent your identity;</li>
          <li>use the Service for any unlawful purpose.</li>
        </ul>

        <h2 className="mt-8 text-xl font-medium text-ink">4. Reporting and moderation</h2>
        <p className="mt-2">
          You can report any user who breaks these rules. We may suspend or ban users who violate the
          Terms. We are not obliged to monitor conversations and act primarily on reports.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">5. Advertising</h2>
        <p className="mt-2">
          The Service may display advertising. Ads are shown outside the live video and, where
          required, only after you accept advertising cookies. See our{' '}
          <Link href="/privacy" className="text-primary">Privacy Policy</Link>.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">6. Disclaimers</h2>
        <p className="mt-2">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind. You interact with other users at your own risk. We do not control
          and are not responsible for other users&rsquo; behaviour or content.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">7. Limitation of liability</h2>
        <p className="mt-2">
          To the maximum extent permitted by law, we are not liable for any indirect, incidental or
          consequential damages arising from your use of the Service.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">8. Changes</h2>
        <p className="mt-2">
          We may update these Terms. Continued use after changes constitutes acceptance of the updated
          Terms.
        </p>

        <h2 className="mt-8 text-xl font-medium text-ink">9. Contact</h2>
        <p className="mt-2">
          Questions? Contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>.
        </p>

        <p className="mt-10 border-t border-line pt-6 text-sm">
          See also our <Link href="/privacy" className="text-primary">Privacy Policy</Link>. Return to{' '}
          <Link href="/" className="text-primary">CHAT</Link>.
        </p>
      </main>
    </div>
  );
}
