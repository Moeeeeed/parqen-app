const { execSync } = require('child_process');

const diff = execSync('git diff --cached -- . ":(exclude).husky"', { encoding: 'utf8' });

const patterns = [
  /MNEMONIC=[a-z]/i,
  /SUPABASE_SERVICE_ROLE_KEY=ey/,
  /SUPABASE_SERVICE_ROLE_KEY=sb_secret_/,
  /JWT_SECRET=.{20}/,
  /PRIVATE KEY-----/,
  /SG\.[A-Za-z0-9_-]{15}/,
  /xsmtpsib-/,
  /re_[A-Za-z0-9]{15}/,
  /atsk_[a-z0-9]{15}/,
  /sb_secret_/,
  /sk_live_/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20}/
];

let blocked = false;
for (const p of patterns) {
  if (diff.match(p)) {
    console.error('');
    console.error('Secret detected in staged changes - commit blocked.');
    console.error('Pattern matched: ' + p);
    console.error('Remove the secret and try again.');
    blocked = true;
  }
}

if (blocked) process.exit(1);
