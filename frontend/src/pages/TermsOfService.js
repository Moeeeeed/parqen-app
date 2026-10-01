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

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO
        title="Terms of Service | PRAQEN"
        description="The terms that govern your use of PRAQEN — trading, escrow, fees, wallet custody, disputes, and account rules."
      />

      <div style={{ backgroundColor: C.forest }} className="w-full">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-3">Terms of Service</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 flex-1 w-full">
        <article>
          <p className="text-[15px] leading-7 mb-8" style={{ color: C.g700 }}>
            These Terms of Service ("Terms") govern your access to and use of PRAQEN (the "Service"), operated at
            praqen.com. By creating an account or using the Service, you agree to be bound by these Terms. If you
            do not agree, do not use the Service.
          </p>

          <Section title="1. Eligibility">
            <p>You must be at least 18 years old and legally able to enter into a binding contract to use PRAQEN. You are responsible for ensuring that using a peer-to-peer cryptocurrency trading platform is lawful where you live — PRAQEN does not verify or guarantee legality in every jurisdiction.</p>
          </Section>

          <Section title="2. Your Account">
            <p>You must provide accurate registration information and keep it up to date. You are responsible for all activity on your account and for keeping your password secure.</p>
            <p><strong>Verification levels:</strong> basic actions require a verified email and phone number. Higher trade and withdrawal limits require identity verification (KYC) — uploading a government-issued ID (passport, driver's license, or national ID). We may request additional verification at any time to comply with legal or security requirements.</p>
          </Section>

          <Section title="3. Wallet Custody">
            <p>PRAQEN provides each user with a Bitcoin and USDT (TRC-20) deposit address. <strong>PRAQEN wallets are custodial</strong> — the platform, not the individual user, holds and controls the underlying private keys, and your in-app balance is a record we maintain on our systems. This is different from a self-custody wallet where only you control the keys. Do not treat your PRAQEN balance as equivalent to holding your own private keys.</p>
          </Section>

          <Section title="4. How Trading Works">
            <p>PRAQEN is a peer-to-peer marketplace: users create buy/sell offers and trade directly with each other. When a trade starts, the seller's Bitcoin (or USDT) is locked in escrow so it cannot be withdrawn or cancelled while the trade is active. The buyer sends payment through the agreed method (Mobile Money, bank transfer, or other supported method) directly to the seller, then marks the trade as paid. The seller confirms receipt of payment and releases the escrowed funds to the buyer.</p>
            <p>Trades have a limited time window to complete before they may expire. You are responsible for confirming payment has genuinely arrived in your own account before releasing any escrowed funds — PRAQEN is not a party to the underlying payment (e.g. Mobile Money or bank transfer) between users.</p>
          </Section>

          <Section title="5. Fees">
            <p>PRAQEN charges a 2% fee on completed Bitcoin/USDT trades. Withdrawals to an external wallet may also incur a blockchain network fee, which is separate from the platform fee and varies with network conditions. Fees are disclosed before you confirm an action.</p>
          </Section>

          <Section title="6. Disputes">
            <p>If a buyer and seller disagree about whether payment was made, either party can open a dispute. PRAQEN's support team reviews evidence (payment proof, chat history) and makes a determination, typically within 24 hours. Our decision on a dispute is final. Escrow exists specifically so that no Bitcoin or USDT is released until a trade is confirmed or a dispute is resolved.</p>
          </Section>

          <Section title="7. Prohibited Conduct">
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Use the Service for money laundering, terrorist financing, or any illegal purpose</li>
              <li>Create multiple accounts to evade limits, bans, or verification requirements</li>
              <li>Provide false identity or verification information</li>
              <li>Attempt to reverse, charge back, or otherwise dispute a payment in bad faith after a trade has completed</li>
              <li>Interfere with, disrupt, or attempt to gain unauthorized access to the Service</li>
            </ul>
          </Section>

          <Section title="8. Suspension &amp; Termination">
            <p>We may suspend or terminate your account, freeze funds, or reverse a transaction if we reasonably believe it is necessary to comply with law, prevent fraud, or enforce these Terms. Where possible, we will notify you and explain the reason.</p>
          </Section>

          <Section title="9. Risk Disclosure">
            <p>Cryptocurrency prices are highly volatile, and trading carries real financial risk. PRAQEN does not provide financial, investment, or legal advice, and nothing on the Service should be treated as such. You are solely responsible for your own trading decisions.</p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>The Service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, PRAQEN is not liable for indirect, incidental, or consequential damages, including losses from price volatility, unauthorized account access resulting from your own failure to secure your credentials, or actions taken by other users during a peer-to-peer trade.</p>
          </Section>

          <Section title="11. Changes to These Terms">
            <p>We may update these Terms from time to time. Continued use of the Service after a change takes effect means you accept the updated Terms. Material changes will be reflected by updating the "Last updated" date above.</p>
          </Section>

          <Section title="12. Contact Us">
            <p>Questions about these Terms? Email us at{' '}
              <a href="mailto:hello@praqen.com" className="font-bold underline" style={{ color: C.green }}>hello@praqen.com</a>.
            </p>
          </Section>

          <p className="text-sm mt-10" style={{ color: C.g600 }}>
            See also our <Link to="/privacy" className="font-bold underline" style={{ color: C.green }}>Privacy Policy</Link>.
          </p>
        </article>
      </div>

      <PRQFooter />
    </div>
  );
}
