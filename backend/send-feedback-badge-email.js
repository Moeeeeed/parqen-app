// ============================================================
// PRAQEN Feedback + Badge Notification Email
// Run from backend folder: node send-feedback-badge-email.js
// Sends each user their own feedback score / badge from RECIPIENTS below —
// exactly the numbers supplied, one email per unique address, no lookups.
// ============================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');

// ── Config ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = `PRAQEN <${process.env.SMTP_FROM || process.env.EMAIL_USER}>`;
const SUBJECT = '🏅 Your PRAQEN Feedback Score';

// Deduplicated from the pasted list: identical repeats collapsed to one entry,
// badge carried over from whichever row had it. duodumaxwell9045@gmail.com is
// deliberately excluded — it appeared with two different numbers (43 and 49)
// and is not being guessed at.
const RECIPIENTS = [
  { email: 'ezazz@me.com', feedback: 4238, badge: 'Power' },
  { email: 'stephenpaul982@gmail.com', feedback: 78, badge: '' },
  { email: 'mrkulguy5@gmail.com', feedback: 340, badge: '' },
  { email: 'sasuemmanuel81@gmail.com', feedback: 133, badge: '' },
  { email: 'opokubaffouremmanuel0712@gmail.com', feedback: 2963, badge: 'Expert/peer' },
  { email: 'aduntirexford86@gmail.com', feedback: 385, badge: '' },
  { email: 'sevorhub@gmail.com', feedback: 479, badge: '' },
  { email: 'enyawudzo@gmail.com', feedback: 691, badge: 'Expert' },
  { email: 'sweetname770@gmail.com', feedback: 256, badge: '' },
  { email: 'julianatamakloe79@gmail.com', feedback: 162, badge: '' },
  { email: 'meetsamuel66@gmail.com', feedback: 33, badge: '' },
  { email: 'saintgash200342@gmail.com', feedback: 82, badge: '' },
  { email: 'rolandayamdoo96@gmail.com', feedback: 388, badge: '' },
  { email: 'laryeabismarknii@gmail.com', feedback: 11, badge: '' },
  { email: 'timmackk3@gmail.com', feedback: 541, badge: '' },
  { email: 'raufadams07@gmail.com', feedback: 234, badge: '' },
  { email: 'mariahunter6060@gmail.com', feedback: 73, badge: '' },
  { email: 'andrewejike917@gmail.com', feedback: 34, badge: '' },
  { email: 'aadilyarif@outlook.com', feedback: 210, badge: '' },
  { email: 'mohammedsibrahim7@gmail.com', feedback: 185, badge: '' },
  { email: 'scootattoney8054@gmail.com', feedback: 152, badge: '' },
  { email: 'cb3033cb@gmail.com', feedback: 6219, badge: 'power' },
  { email: 'nbvcx869@gmail.com', feedback: 39, badge: '' },
  { email: 'ericamoore11122@gmail.com', feedback: 222, badge: '' },
  { email: 'mohammedameen0024@gmail.com', feedback: 526, badge: '' },
  { email: 'kemboimeshak608@gmail.com', feedback: 328, badge: '' },
  { email: 'daniellaahoua01@gmail.com', feedback: 1225, badge: '' },
  { email: 'i.clerk.123@gmail.com', feedback: 314, badge: '' },
  { email: 'charles@marxsmith.com', feedback: 107797, badge: '' },
  { email: 'denis030590@icloud.com', feedback: 10070, badge: '' },
  { email: 'agnesnuvor70@gmail.com', feedback: 192, badge: '' },
  { email: 'ishawuabdulrashad7@gmail.com', feedback: 243, badge: '' },
  { email: '17553767701@163.com', feedback: 613, badge: 'Power' },
  { email: '15564735239@163.com', feedback: 966, badge: 'power' },
  { email: 'wj13020533315@163.com', feedback: 37117, badge: 'power' },
  { email: 'sellercuibap1102@gmail.com', feedback: 19683, badge: 'Expert/diamond' },
  { email: 'zuberuseidu32@gmail.com', feedback: 31, badge: '' },
  { email: 'mamexadim6269@gmail.com', feedback: 359, badge: '' },
  { email: 'twumasiisaac137@gmail.com', feedback: 201, badge: '' },
  { email: 'nguyentrunghoan.mg@gmail.com', feedback: 64496, badge: '' },
  { email: 'pualgio@gmail.com', feedback: 201, badge: '' },
  { email: 'masumhaque125@gmail.com', feedback: 911, badge: '' },
  { email: 'florine21005111@gmail.com', feedback: 20, badge: '' },
  { email: 'henryransom20@gmail.com', feedback: 269, badge: '' },
  { email: 'zagyinikonko2@gmail.com', feedback: 2598, badge: '' },
  { email: 'benjezcallies@gmail.com', feedback: 915, badge: '' },
  { email: 'johnyaspect@gmail.com', feedback: 2064, badge: '' },
  { email: 'cyb_tj@hotmail.com', feedback: 1882, badge: 'power' },
  { email: 'quayeabraham999@gmail.com', feedback: 263, badge: '' },
  { email: 'danielkante12345@gmail.com', feedback: 690, badge: '' },
  { email: 'kl6217030@gmail.com', feedback: 386, badge: '' },
  { email: 'abdulmalikpopooola@gmail.com', feedback: 51, badge: '' },
  { email: 'mohammedhatik@gmail.com', feedback: 2572, badge: '' },
  { email: 'elgreat0712@gmail.com', feedback: 920, badge: '' },
  { email: 'julianaasenso56@gmail.com', feedback: 523, badge: '' },
  { email: 'abdullatifayuba6@gmail.com', feedback: 67, badge: '' },
  { email: 'aliletstrade24@gmail.com', feedback: 24, badge: '' },
  { email: 'adewaledare12@gmail.com', feedback: 27, badge: '' },
  { email: 'kojogodlove@gmail.com', feedback: 59, badge: '' },
  { email: 'otsamenterprise@gmail.com', feedback: 15, badge: '' },
  { email: 'gilbertkwabenaojo62@gmail.com', feedback: 388, badge: '' },
  { email: 'hani46rty@gmail.com', feedback: 585, badge: '' },
  { email: 'karwiah10@gmail.com', feedback: 1452, badge: '' },
  { email: 'davidsonpatrick22.dp@gmail.com', feedback: 10, badge: '' },
  { email: 'maccline3@gmail.com', feedback: 71, badge: '' },
  { email: 'felixmbuli53@gmail.com', feedback: 90, badge: '' },
  { email: 'nzalieenowdavid@gmail.com', feedback: 111, badge: '' },
  { email: 'richenyo21@gmail.com', feedback: 2724, badge: '' },
  { email: 'madamanezh@gmail.com', feedback: 474, badge: '' },
  { email: 'linusngetich10@gmail.com', feedback: 162, badge: '' },
  { email: 'lizquincyb@gmail.com', feedback: 322, badge: '' },
  { email: 'dicksonnyaihicho29@gmail.com', feedback: 42, badge: '' },
  { email: 'kelvinkiprugut2003@gmail.com', feedback: 32, badge: '' },
  { email: 'dongld1997@gmail.com', feedback: 23721, badge: 'power' },
  { email: 'jackmuthaura30@gmail.com', feedback: 3003, badge: '' },
  { email: 'krotich133@gmail.com', feedback: 30, badge: '' },
];

const buildHTML = (feedback, badge) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your PRAQEN Feedback Score</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:50%;padding:12px 18px;margin-bottom:12px;">
              <span style="font-size:34px;">₿</span>
            </div>
            <h1 style="margin:0 0 6px;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">PRAQEN</h1>
            <p style="margin:0;font-size:14px;color:#A7F3D0;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">P2P Bitcoin Trading Platform</p>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="padding:32px;">
            <h1 style="font-size:22px;font-weight:900;color:#1B4332;margin:0 0 20px;text-align:center;">🏅 Your Feedback Score</h1>

            <div style="background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-radius:14px;padding:26px 24px;margin-bottom:14px;border:2px solid #86EFAC;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#166534;">Feedback Score</p>
              <p style="margin:0;font-size:38px;font-weight:900;color:#166534;">${feedback.toLocaleString()}</p>
            </div>

            ${badge ? `
            <div style="background:linear-gradient(135deg,#FFF7ED,#FFFBEB);border-radius:14px;padding:20px 24px;margin-bottom:24px;border:2px solid #FDE68A;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#92400E;">Badge</p>
              <p style="margin:0;font-size:20px;font-weight:900;color:#92400E;">${badge}</p>
            </div>` : ''}

            <p style="text-align:center;font-size:14px;color:#64748B;line-height:1.6;margin:0 0 24px;">
              This reflects your trading activity and reputation on PRAQEN. Keep trading to grow it further.
            </p>

            <div style="text-align:center;margin:8px 0 8px;">
              <a href="https://praqen.com/dashboard"
                style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;text-decoration:none;font-size:15px;font-weight:900;padding:14px 36px;border-radius:12px;">
                View My Dashboard
              </a>
            </div>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#F8FAFC;padding:20px 32px;border-top:1.5px solid #E2E8F0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#1B4332;">— The PRAQEN Team 💙</p>
            <p style="margin:0;font-size:11px;color:#CBD5E1;">
              You're receiving this because you have an account on PRAQEN.<br/>
              © ${new Date().getFullYear()} PRAQEN. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

const buildText = (feedback, badge) => `Your PRAQEN Feedback Score

Feedback Score: ${feedback.toLocaleString()}
${badge ? `Badge: ${badge}\n` : ''}
This reflects your trading activity and reputation on PRAQEN. Keep trading to grow it further.

View your dashboard: https://praqen.com/dashboard

— The PRAQEN Team 💙`;

// ── Delay helper ─────────────────────────────────────────────
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🚀 PRAQEN Feedback/Badge Email — Starting...\n');

  try {
    await transporter.verify();
    console.log(`✅ SMTP connected (from: ${FROM_ADDRESS})\n`);
  } catch (err) {
    console.error('❌ SMTP connection failed:', err.message);
    process.exit(1);
  }

  console.log(`📋 ${RECIPIENTS.length} unique recipients queued\n`);

  let sent = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < RECIPIENTS.length; i++) {
    const r = RECIPIENTS[i];
    const num = `[${i + 1}/${RECIPIENTS.length}]`;
    try {
      await transporter.sendMail({
        from: FROM_ADDRESS,
        to: r.email,
        subject: SUBJECT,
        text: buildText(r.feedback, r.badge),
        html: buildHTML(r.feedback, r.badge),
      });
      console.log(`✅ ${num} Sent → ${r.email} (feedback=${r.feedback}${r.badge ? `, badge=${r.badge}` : ''})`);
      sent++;
    } catch (err) {
      console.error(`❌ ${num} Failed → ${r.email}: ${err.message}`);
      failed++;
      failures.push({ email: r.email, error: err.message });
    }
    if (i < RECIPIENTS.length - 1) await delay(500);
  }

  console.log('\n══════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`✅ Sent   : ${sent}`);
  console.log(`❌ Failed : ${failed}`);
  if (failures.length > 0) {
    console.log('\n⚠️  Failed emails:');
    failures.forEach((f) => console.log(`   • ${f.email} → ${f.error}`));
  }
  console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});
