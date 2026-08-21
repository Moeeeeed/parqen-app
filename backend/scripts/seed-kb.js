#!/usr/bin/env node
// ============================================================
// Seed Knowledge Base — idempotent, non-destructive
// Populates kb_articles from the existing FAQ_BY_TOPIC content
// and generates embeddings via Mistral mistral-embed.
//
// Usage:
//   node scripts/seed-kb.js              # seed all topics
//   node scripts/seed-kb.js buy sell     # seed only specific topics
//
// Requirements:
//   - MISTRAL_API_KEY in backend/.env
//   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
//   - Run the migration (20260821_create_ai_chat_rag_tables.sql) first
// ============================================================

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!MISTRAL_KEY) {
  console.error('❌ Missing MISTRAL_API_KEY in .env — needed for generating embeddings');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── FAQ articles — mirrors FAQ_BY_TOPIC from SuggestionsPanel.js ─────────
const FAQ_ARTICLES = [
  // ── BUY ──
  { topic: 'buy', title: 'How do I find a seller?', content: 'Go to Buy Bitcoin and browse offers by country and payment method. Filter using the search bar at the top of the page.' },
  { topic: 'buy', title: 'How does escrow protect me?', content: 'The seller locks BTC in escrow before you pay. You only release it after confirming payment in My Trades. Escrow ensures your Bitcoin is safe until you confirm you received payment.' },
  { topic: 'buy', title: 'What payment methods are accepted?', content: 'PRAQEN supports MoMo (MTN, Vodafone, AirtelTigo), bank transfers, and gift cards. Payment methods vary by seller offer — check the listing details for available options.' },

  // ── SELL ──
  { topic: 'sell', title: 'How do I create a listing?', content: 'Go to Sell Bitcoin and set your price, margin, payment methods, and limits. Your wallet must have at least $10 in BTC for the listing to appear.' },
  { topic: 'sell', title: 'How is pricing calculated?', content: 'You can set a fixed price or a margin above/below the market rate. The price updates automatically with the current Bitcoin market rate.' },
  { topic: 'sell', title: 'When do I lock escrow?', content: 'When a buyer opens a trade, you will be prompted to lock the exact BTC amount into escrow before they pay. This protects the buyer and ensures you have the funds to complete the trade.' },

  // ── TRADE ──
  { topic: 'trade', title: 'How do I raise a dispute?', content: 'Open the trade in My Trades and tap Raise Dispute. A moderator will review within 24 hours. Include any evidence (screenshots, receipts) to support your case.' },
  { topic: 'trade', title: 'Why is my trade stuck?', content: 'Check if payment has been sent or received. If the buyer hasn\'t paid yet, you can cancel after the time limit expires. For payment issues, contact the other party directly.' },
  { topic: 'trade', title: 'What happens if someone scams me?', content: 'Raise a dispute immediately. Our moderators review all evidence. Never release escrow without confirming payment has been received in your account.' },

  // ── PAYMENT ──
  { topic: 'payment', title: 'Payment not showing up?', content: 'MoMo payments usually arrive within 5 minutes. Bank transfers can take up to 2 hours. Keep your receipt as proof of payment.' },
  { topic: 'payment', title: 'Can I change payment method?', content: 'Only the payment method listed on the offer is valid. Sending via a different method may delay the trade and could result in a dispute.' },
  { topic: 'payment', title: 'What if I sent to the wrong number?', content: 'Contact your payment provider immediately. Let the seller know and attach the receipt to your ticket for evidence. Time is critical in these situations.' },

  // ── ACCOUNT ──
  { topic: 'account', title: 'Forgot your password?', content: 'Tap Forgot Password on the login page. A reset link will be sent to your email within a few minutes. Check your spam folder if you don\'t see it.' },
  { topic: 'account', title: 'How do I verify my ID?', content: 'Go to Settings, then Verification and upload your government ID. Verification unlocks higher trade limits and builds trust with other traders.' },
  { topic: 'account', title: 'Can I change my email or phone?', content: 'Go to Settings to update your profile info. You\'ll need to verify the new contact before it\'s saved to your account.' },

  // ── WALLET ──
  { topic: 'wallet', title: 'How do I deposit BTC?', content: 'Go to Wallet and tap Deposit. Copy your PRAQEN wallet address and send BTC from any external wallet. You can also scan the QR code.' },
  { topic: 'wallet', title: 'How do I withdraw BTC?', content: 'Go to Wallet, then Withdraw, enter an external BTC address and the amount. A small network fee applies to cover the Bitcoin miner fee.' },
  { topic: 'wallet', title: 'Why is my balance locked?', content: 'Locked balance is BTC held in active trade escrow. It is released when the trade completes or is cancelled. Check My Trades to see your active trades.' },

  // ── KYC ──
  { topic: 'kyc', title: 'What documents are accepted?', content: 'Government-issued ID including passport, driver\'s license, and national ID. Upload clear photos in Settings, then Verification.' },
  { topic: 'kyc', title: 'How long does KYC review take?', content: 'Most verifications are reviewed within 24 hours. You\'ll get a notification once your verification is approved or if additional information is needed.' },
  { topic: 'kyc', title: 'Is KYC required to trade?', content: 'Basic trading is available without KYC. Higher limits and certain payment methods require verification. KYC also builds trust with other traders.' },

  // ── OTHER ──
  { topic: 'other', title: 'How do I contact support?', content: 'You\'re in the right place! Create a ticket below and our team will get back to you within 24 hours. You can also use the AI Chat for quick answers.' },
  { topic: 'other', title: 'Is my data secure?', content: 'Absolutely. All data is encrypted in transit and at rest. We never share your personal information with third parties.' },
  { topic: 'other', title: 'Can I delete my account?', content: 'Contact support and we\'ll help you close your account and withdraw any remaining balance. Account deletion is permanent.' },

  // ── GENERAL PLATFORM INFO ──
  { topic: null, title: 'What is PRAQEN?', content: 'PRAQEN is a peer-to-peer Bitcoin trading platform where users buy and sell Bitcoin using local currencies like GHS, NGN, KES, and ZAR via mobile money, bank transfer, and gift cards. All trades are escrow-protected.' },
  { topic: null, title: 'How much are the fees?', content: 'PRAQEN charges 0.5% on completed trades only, deducted from the Bitcoin amount. There are no fees for listing offers or depositing BTC. Withdrawal fees depend on current Bitcoin network congestion.' },
  { topic: null, title: 'How does the referral program work?', content: 'Your unique referral code is in your profile page. Share your referral link with friends — when they sign up and complete trades, you earn a commission. The more you refer, the more you earn.' },
  { topic: null, title: 'What are response times for support?', content: 'Urgent tickets get a response in approximately 2 to 4 hours. Normal tickets within 12 to 24 hours. Low priority tickets within 24 to 48 hours. You can attach screenshots to your ticket for faster resolution.' },
  { topic: null, title: 'What is the Gift Card Marketplace?', content: 'PRAQEN has a Gift Card Marketplace where you can buy and sell gift cards (Amazon, iTunes, Steam, Google Play, and many more) for Bitcoin. Just list your card or browse available ones in the marketplace section.' },
  { topic: null, title: 'How does the escrow system work?', content: 'When a buyer opens a trade, the seller locks the exact BTC amount into escrow. The buyer then sends payment via the agreed method. After the seller confirms receiving payment, they release the BTC from escrow to the buyer. This protects both parties.' },
];

// Filter by topic if CLI args provided
const filterTopics = process.argv.slice(2);
const articlesToSeed = filterTopics.length > 0
  ? FAQ_ARTICLES.filter(a => filterTopics.includes(a.topic))
  : FAQ_ARTICLES;

// ── Mistral embedding API ────────────────────────────────────────────────
// Uses mistral-embed model (1024 dimensions)
async function getEmbeddings(texts) {
  const res = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data.map(d => d.embedding);
}

// ── Main seed logic ──────────────────────────────────────────────────────
async function seed() {
  console.log(`\n📚 Seeding ${articlesToSeed.length} knowledge base articles...\n`);

  // Batch embeddings (Mistral supports up to 32 per request)
  const BATCH_SIZE = 20;
  const allEmbeddings = [];

  for (let i = 0; i < articlesToSeed.length; i += BATCH_SIZE) {
    const batch = articlesToSeed.slice(i, i + BATCH_SIZE);
    const texts = batch.map(a => `${a.title}\n\n${a.content}`);
    console.log(`  🔄 Generating embeddings for articles ${i + 1}–${i + batch.length}...`);
    const embeddings = await getEmbeddings(texts);
    allEmbeddings.push(...embeddings);
    if (i + BATCH_SIZE < articlesToSeed.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`  ✅ Generated ${allEmbeddings.length} embeddings\n`);

  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < articlesToSeed.length; i++) {
    const article = articlesToSeed[i];
    const embedding = allEmbeddings[i];

    // Check if article already exists (by title + topic) — idempotent
    const { data: existing } = await supabase
      .from('kb_articles')
      .select('id')
      .eq('title', article.title)
      .eq('topic', article.topic)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('kb_articles')
        .update({
          content: article.content,
          embedding: `[${embedding.join(',')}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`  ❌ Failed to update "${article.title}": ${error.message}`);
      } else {
        updated++;
        console.log(`  🔄 Updated: ${article.title}`);
      }
    } else {
      const { error } = await supabase
        .from('kb_articles')
        .insert({
          topic: article.topic,
          title: article.title,
          content: article.content,
          embedding: `[${embedding.join(',')}]`,
        });

      if (error) {
        console.error(`  ❌ Failed to insert "${article.title}": ${error.message}`);
      } else {
        inserted++;
        console.log(`  ✅ Inserted: ${article.title}`);
      }
    }
  }

  console.log(`\n📊 Results: ${inserted} inserted, ${updated} updated\n`);

  if (inserted + updated > 0) {
    console.log('🔧 Rebuilding IVFFlat index...');
    const { error } = await supabase.rpc('exec_sql', {
      sql: 'REINDEX INDEX IF EXISTS kb_articles_embedding_idx;'
    }).catch(() => ({ error: 'rpc not available — run REINDEX manually' }));
    if (error) {
      console.log(`  ⚠️  Could not auto-reindex (ok if < 500 rows): ${error}`);
    } else {
      console.log('  ✅ Index rebuilt');
    }
  }

  console.log('\n✨ Done! Knowledge base seeded successfully.\n');
}

seed().catch(err => {
  console.error('\n💥 Seed failed:', err.message);
  process.exit(1);
});
