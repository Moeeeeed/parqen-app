// Medals first-day sweep.
//   node scripts/medals-backfill.js            -> DRY RUN (reads only, prints who would get what)
//   node scripts/medals-backfill.js --apply    -> saves the medals (with real earned dates), announces each once,
//                                                 and takes medals off banned/frozen accounts. Only run after Ken says so.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runSweep } = require('../services/medalAwardService');
const apply = process.argv.includes('--apply');
const noNotify = process.argv.includes('--no-notify');
(async () => {
  const r = await runSweep({ apply, notify: apply && !noNotify });
  console.log(`\nMode: ${apply ? 'APPLY' : 'DRY RUN (nothing saved, nobody notified)'}`);
  console.log(`Users checked: ${r.checked}`);
  console.log(`Users who would get medals: ${r.awards.length}`);
  const perMedal = {};
  r.awards.forEach((a) => a.medals.forEach((m) => { perMedal[m] = (perMedal[m] || 0) + 1; }));
  console.log('Per medal:', perMedal);
  console.log(`Restricted accounts losing medals: ${r.revoked.length}`);
  r.awards.forEach((a) => console.log(' +', a.username, a.medals.join(', '), JSON.stringify(a.evidence || {})));
  r.revoked.forEach((a) => console.log(' -', a.username, a.status || ''));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
