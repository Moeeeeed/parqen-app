// One-off script: import migrated feedback counts (email, positive, negative)
// from a pasted list, matched by email. Badge tier is derived the same way
// badgeService.js does (upgrade-only, capped at EXPERT — the top tier, nothing
// exists above it). Run with --apply to actually write; without it, dry-run only.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const SRC = 'C:\\Users\\HPOMEN~1\\AppData\\Local\\Temp\\claude\\C--Users-HP-OMEN\\14e474f8-ef1c-484d-953d-ecd3b03eb913\\scratchpad\\feedback_import.txt';

const TRUST_TIERS = ['BEGINNER', 'STAR', 'TRADER', 'PRO', 'EXPERT'];
function computeTrustTier(feedbackCount) {
  const n = parseInt(feedbackCount || 0);
  if (n >= 10000) return 'EXPERT';
  if (n >= 3000)  return 'PRO';
  if (n >= 100)   return 'TRADER';
  if (n >= 1)     return 'STAR';
  return 'BEGINNER';
}

(async () => {
  const raw = fs.readFileSync(SRC, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  const rowRe = /^(\S+@\S+)\s+(\d+)\s+(\d+)\s*$/;
  const map = new Map(); // email(lowercased) -> {positive, negative, raw}
  const conflicts = [];
  const badLines = [];

  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) { badLines.push(line); continue; }
    const email = m[1].toLowerCase();
    const positive = parseInt(m[2], 10);
    const negative = parseInt(m[3], 10);
    const prev = map.get(email);
    if (prev && (prev.positive !== positive || prev.negative !== negative)) {
      conflicts.push({ email, kept: prev, seen: { positive, negative } });
      // last occurrence wins
    }
    map.set(email, { positive, negative });
  }

  console.log(`Parsed ${lines.length} lines -> ${map.size} unique emails. Bad lines: ${badLines.length}`);
  if (badLines.length) console.log('BAD LINES:', badLines);
  if (conflicts.length) {
    console.log(`\nCONFLICTING duplicates (kept the LAST value in the file):`);
    conflicts.forEach(c => console.log(`  ${c.email}: earlier saw ${c.kept.positive}/${c.kept.negative}, later ${c.seen.positive}/${c.seen.negative} -> using ${c.seen.positive}/${c.seen.negative}`));
  }

  const emails = [...map.keys()];
  const matched = [];
  const notFound = [];

  // Look up in batches
  const BATCH = 50;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('users')
      .select('id, email, username, positive_feedback, negative_feedback, total_feedback_count, badge')
      .in('email', batch);
    if (error) { console.error('LOOKUP ERROR:', error.message); process.exit(1); }
    const foundEmails = new Set((data || []).map(u => u.email.toLowerCase()));
    for (const u of data || []) matched.push(u);
    for (const e of batch) if (!foundEmails.has(e)) notFound.push(e);
  }

  console.log(`\nMatched ${matched.length} of ${emails.length} emails to existing PRAQEN accounts.`);
  if (notFound.length) {
    console.log(`\nNOT FOUND on PRAQEN (${notFound.length}) — no account with this email exists, skipped:`);
    notFound.forEach(e => console.log(`  ${e}`));
  }

  if (VERIFY) {
    let mismatches = [], badgeWrong = [], totalMismatch = [];
    for (const u of matched) {
      const exp = map.get(u.email.toLowerCase());
      if (parseInt(u.positive_feedback) !== exp.positive || parseInt(u.negative_feedback) !== exp.negative) {
        mismatches.push({ email: u.email, expected: exp, got: { positive: u.positive_feedback, negative: u.negative_feedback } });
      }
      const expTier = computeTrustTier(exp.positive + exp.negative);
      if ((u.badge || '').toUpperCase() !== expTier) {
        badgeWrong.push({ email: u.email, badge: u.badge, expectedTier: expTier, feedbackSum: exp.positive + exp.negative });
      }
      if (parseInt(u.total_feedback_count) !== (parseInt(u.positive_feedback) + parseInt(u.negative_feedback))) {
        totalMismatch.push({ email: u.email, total_feedback_count: u.total_feedback_count, pos: u.positive_feedback, neg: u.negative_feedback });
      }
    }
    console.log(`\nVERIFY — positive/negative mismatches: ${mismatches.length}`);
    mismatches.forEach(m => console.log('  ', JSON.stringify(m)));
    console.log(`VERIFY — badge tier mismatches: ${badgeWrong.length}`);
    badgeWrong.forEach(m => console.log('  ', JSON.stringify(m)));
    console.log(`VERIFY — total_feedback_count != positive+negative: ${totalMismatch.length}`);
    totalMismatch.forEach(m => console.log('  ', JSON.stringify(m)));
    return;
  }

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} updates for ${matched.length} users:\n`);

  let upgraded = 0, unchanged = 0, wrote = 0;
  for (const u of matched) {
    const imp = map.get(u.email.toLowerCase());
    const newTotal = imp.positive + imp.negative;
    const newTier = computeTrustTier(newTotal);
    const currentBadge = (u.badge || 'BEGINNER').toUpperCase();
    const currentIdx = TRUST_TIERS.indexOf(currentBadge);
    const newIdx = TRUST_TIERS.indexOf(newTier);
    const finalBadge = newIdx > currentIdx ? newTier : currentBadge; // never downgrade badge
    if (finalBadge !== currentBadge) upgraded++; else unchanged++;

    console.log(`  ${u.email.padEnd(38)} pos ${String(u.positive_feedback||0).padStart(6)} -> ${String(imp.positive).padStart(6)} | neg ${String(u.negative_feedback||0).padStart(4)} -> ${String(imp.negative).padStart(4)} | badge ${currentBadge} -> ${finalBadge}`);

    if (APPLY) {
      const { error: updErr } = await supabase.from('users').update({
        positive_feedback: imp.positive,
        negative_feedback: imp.negative,
        total_feedback_count: newTotal,
        badge: finalBadge,
      }).eq('id', u.id);
      if (updErr) { console.error(`    WRITE FAILED for ${u.email}: ${updErr.message}`); continue; }
      wrote++;
    }
  }

  console.log(`\nSummary: ${matched.length} matched, ${notFound.length} not found, ${upgraded} badge upgrades, ${unchanged} badge unchanged.`);
  if (APPLY) console.log(`Wrote ${wrote} rows to the database.`);
  else console.log('Nothing written — dry run only.');
})();
