import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import PRQFooter from '../components/PRQFooter';

const C = {
  forest: '#1B4332', green: '#2D6A4F',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
};

const LAST_UPDATED = 'September 22, 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-black mb-3" style={{ color: C.g800 }}>{title}</h2>
      <div className="space-y-3 text-[15px] leading-7" style={{ color: C.g700 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO
        title="Privacy Policy | PRAQEN"
        description="How PRAQEN collects, uses, and protects your personal data — including KYC verification, wallet information, and third-party services we use."
      />

      <div style={{ backgroundColor: C.forest }} className="w-full">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-3">Privacy Policy</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 flex-1 w-full">
        <article>
          <p className="text-[15px] leading-7 mb-8" style={{ color: C.g700 }}>
            This Privacy Policy explains what information PRAQEN ("we", "us", "our") collects when you use our
            website and services at praqen.com (the "Service"), why we collect it, and how it is protected. By
            using the Service, you agree to the practices described here.
          </p>

          <Section title="1. Information We Collect">
            <p><strong>Account information:</strong> username, email address, phone number, full name, country, and a securely hashed password. If you sign in with Google, we receive your name, email address, and profile picture from your Google account.</p>
            <p><strong>Identity verification (KYC):</strong> to comply with anti-fraud and financial regulations, and to unlock higher trade limits, we may ask you to upload a photo of a government-issued ID (passport, driver's license, or national ID card). These images are used solely to verify your identity.</p>
            <p><strong>Transaction data:</strong> trade history, wallet balances, Bitcoin and USDT deposit addresses, deposit and withdrawal records, and messages exchanged with other users during a trade.</p>
            <p><strong>Support communications:</strong> messages you send to our support team or through in-app chat.</p>
            <p><strong>Device and usage data:</strong> IP address (used for fraud prevention and to estimate your country for currency/payment defaults), browser and device type, and general usage patterns on the Service.</p>
            <p><strong>Push notification tokens:</strong> if you enable notifications, a device token is stored so we can deliver trade and account alerts to you.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="list-disc list-inside space-y-2">
              <li>Create and secure your account, and verify your identity for KYC/compliance purposes</li>
              <li>Process and facilitate peer-to-peer trades, escrow, deposits, and withdrawals</li>
              <li>Send transactional messages: trade updates, deposit/withdrawal confirmations, security alerts</li>
              <li>Detect and prevent fraud, money laundering, and abuse of the Service</li>
              <li>Respond to support requests</li>
              <li>Improve the Service and understand how it's used</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>
          </Section>

          <Section title="3. Third-Party Services We Use">
            <p>We rely on the following third-party services to operate PRAQEN. Each processes a limited slice of your data strictly to perform its function:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Supabase</strong> — our database and authentication infrastructure, where account and transaction data is stored</li>
              <li><strong>Twilio &amp; Africa's Talking</strong> — send SMS/WhatsApp codes for phone number verification</li>
              <li><strong>Google</strong> — Google Sign-In (optional) and Google Analytics (site usage statistics)</li>
              <li><strong>OneSignal</strong> — delivers push notifications to your device</li>
              <li><strong>Cloudflare</strong> — protects the Service from attacks and abuse</li>
              <li><strong>Email delivery providers</strong> — send account, trade, and security emails</li>
              <li><strong>Public blockchain networks</strong> (Bitcoin, Tron) and blockchain data providers (e.g. mempool.space, TronGrid) — used to detect deposits and broadcast transactions. Wallet addresses and transaction amounts are, by the nature of public blockchains, visible on-chain to anyone.</li>
            </ul>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain account and transaction data for as long as your account is active, and for a period afterward as required by applicable financial recordkeeping and anti-money-laundering regulations. KYC documents are stored securely and accessed only for verification and compliance purposes.</p>
          </Section>

          <Section title="5. Data Security">
            <p>We use industry-standard safeguards — encrypted connections (HTTPS), hashed passwords, and access-controlled infrastructure — to protect your information. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>Depending on your country of residence, you may have the right to access, correct, or request deletion of your personal data, subject to our obligation to retain certain records for legal and regulatory compliance. To make a request, contact us at the email below.</p>
          </Section>

          <Section title="7. Children's Privacy">
            <p>PRAQEN is not intended for use by anyone under the age of 18. We do not knowingly collect information from minors.</p>
          </Section>

          <Section title="8. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the "Last updated" date above.</p>
          </Section>

          <Section title="9. Contact Us">
            <p>Questions about this Privacy Policy or your data? Email us at{' '}
              <a href="mailto:hello@praqen.com" className="font-bold underline" style={{ color: C.green }}>hello@praqen.com</a>.
            </p>
          </Section>

          <p className="text-sm mt-10" style={{ color: C.g600 }}>
            See also our <Link to="/terms" className="font-bold underline" style={{ color: C.green }}>Terms of Service</Link>.
          </p>
        </article>
      </div>

      <PRQFooter />
    </div>
  );
}
