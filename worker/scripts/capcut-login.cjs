// Run on a computer with a screen (e.g. your Windows PC), once per CapCut
// account:   node worker/scripts/capcut-login.cjs cc1
// A browser opens; log in to CapCut, then press Enter here. The session is
// saved to cc1.state.json — copy it to the server's
// /var/lib/kali-ai/state/capcut-profiles/ (the label must match the
// generation_accounts.label). The file is a login session: keep it private,
// never commit it.
const { chromium } = require('playwright');
const readline = require('node:readline');

async function main() {
  const label = process.argv[2];
  if (!label) { console.error('usage: node capcut-login.cjs <account-label>'); process.exit(1); }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.capcut.com/login');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question(`CapCut'e "${label}" hesabıyla giriş yap, sonra Enter'a bas... `, r));
  rl.close();
  const file = `${label.replace(/[^\w-]/g, '_')}.state.json`;
  await context.storageState({ path: file });
  await browser.close();
  console.log(`Kaydedildi: ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
