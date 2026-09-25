// Medals first-day sweep.
//   node scripts/medals-backfill.js            -> DRY RUN (reads only, prints who would get what and why)
//   node scripts/medals-backfill.js --json     -> same, also writes medals-dryrun.json next to this file
//   node scripts/medals-backfill.js --apply    -> saves the medals (real earned dates), announces each once,
//                                                 and takes medals off banned/frozen accounts.
//                                                 Only run after Ken says so. Add --no-notify to save without announcing.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { runSweep } = require('../services/medalAwardService');
const ms = require('../services/medalService');

const apply = process.argv.includes('--apply');
const noNotify = process.argv.includes('--no-notify');
const wantJson = process.argv.includes('--json');

(async () => {
  const t0 = Date.now();
  const r = await runSweep({ apply, notify: apply && !noNotify });
  console.log(`\nMode: ${apply ? 'APPLY' : 'DRY RUN (nothing saved, nobody notified)'}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`Users checked: ${r.candidates}`);
  console.log(`Users who get medals: ${r.awards.length}`);
  const perMedal = {};
  r.awards.forEach((a) => a.medals.forEach((m) => { perMedal[m] = (perMedal[m] || 0) + 1; }));
  console.log('Per medal:', perMedal);
  console.log(`Banned/frozen accounts losing medals: ${r.revoked.length}`);
  console.log(`Banned/frozen accounts skipped (would have qualified by activity): ${r.skippedRestricted.length}\n`);
  r.awards.forEach((a) => {
    const s = a.stats;
    console.log(` + ${a.username}: ${a.medals.map((m) => ms.MEDAL_META[m].name).join(', ')}`);
    console.log(`     trades ${s.totalTrades} | volume $${Math.round(s.totalVolumeUsd)} | momo ${s.momoTrades} | bank ${s.bankTrades} | gift ${s.giftCardTrades} | disputes ${s.disputeCount} | cancels ${s.cancelledCount} | streak ${s.dailyStreak}d | top ${s.volumePercentile}% pctile | joined ${String(s.registeredAt || '').slice(0, 10)}`);
  });
  r.revoked.forEach((a) => console.log(` - ${a.username} (${a.status}): ${a.medals} medal(s) removed`));
  if (wantJson) {
    fs.writeFileSync(path.join(__dirname, 'medals-dryrun.json'), JSON.stringify(r, null, 2));
    console.log('\nWrote scripts/medals-dryrun.json');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
