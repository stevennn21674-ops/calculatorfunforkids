/* Makes the OWNER_HASH for your owner password (stevennn). Paste it into Cloudflare as a secret. */
'use strict';
const crypto = require('crypto'), readline = require('readline'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\n  Type the owner password you want for "stevennn" (it will show while you type): ', pw => {
  rl.close(); pw = pw.trim();
  if (pw.length < 4) { console.log('\n  Too short — use at least 4 characters.'); process.exit(1); }
  const hash = crypto.pbkdf2Sync(pw, 'us2-owner-v1', 10000, 32, 'sha256').toString('hex');
  fs.mkdirSync(path.join(__dirname, '.preview'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '.preview', 'owner-hash.txt'), hash);
  try { execSync('clip', { input: hash }); console.log('\n  (Copied to your clipboard.)'); } catch {}
  console.log(`\n  OWNER_HASH =\n\n  ${hash}\n\n  In Cloudflare: your Pages project → Settings → Variables and Secrets → Add\n    Type: Secret   Name: OWNER_HASH   Value: (paste the line above)\n  Then redeploy (Deployments → … → Retry deployment), or push any change to GitHub.\n  The preview .bat will also use this password.\n`);
});
