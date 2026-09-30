// Diagnostic: open the CapCut flow's start page with a saved account session,
// dismiss pop-ups, then report the URL, visible controls and file inputs and
// upload screenshots to Storage (screenshots/inspect-*.png).
//   sudo bash -c 'set -a; . /opt/kali-ai/.env.local; cd /opt/kali-ai; node worker/scripts/capcut-inspect.cjs cc1 [url]'
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createStorage } = require('../providers/storage.cjs');

const DISMISS = [
  '[role=dialog] [aria-label*="lose" i]', '[role=dialog] button[class*="close" i]', '[class*="modal" i] [class*="close" i]',
  'button[aria-label*="close" i]', '[class*="close-btn" i]', '[class*="closeIcon" i]', 'text=/^(skip|not now|later|got it|atla|kapat)$/i',
];

async function dismiss(page) {
  let closed = 0;
  for (let round = 0; round < 3; round++) {
    await page.keyboard.press('Escape').catch(() => {});
    for (const sel of DISMISS) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 3000 }).catch(() => {}); closed++; await page.waitForTimeout(800); }
    }
  }
  return closed;
}

async function main() {
  const label = process.argv[2] || 'cc1';
  const flow = JSON.parse(readFileSync(resolve(__dirname, '../../config/capcut-flow.json'), 'utf8'));
  const url = process.argv[3] || flow.start_url;
  const profiles = process.env.CAPCUT_PROFILES_DIR || '/var/lib/kali-ai/state/capcut-profiles';
  const { chromium } = require('playwright');
  const ctx = await chromium.launchPersistentContext(join(profiles, `inspect-${label}`), { headless: true, viewport: { width: 1440, height: 900 } });
  const statePath = join(profiles, `${label}.state.json`);
  if (existsSync(statePath)) await ctx.addCookies(JSON.parse(readFileSync(statePath, 'utf8')).cookies || []);
  const page = ctx.pages()[0] || await ctx.newPage();
  const storage = createStorage({ supabaseUrl: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.CONTENT_BUCKET || 'content' });
  const stamp = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(8000);
    const shot = async (name) => {
      const png = await page.screenshot({ type: 'png', timeout: 60_000, animations: 'disabled' }).catch((e) => { console.log(`(goruntu alinamadi: ${e.message.split('\n')[0]})`); return null; });
      return png ? storage.upload(`screenshots/inspect-${stamp}-${name}.png`, png, 'image/png') : '-';
    };
    const closed = await dismiss(page);
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const txt = (e) => (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      const controls = [...document.querySelectorAll('button, [role=button], a, textarea, input, [contenteditable=true]')]
        .filter(vis).map((e) => `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ''} "${txt(e)}"${e.className && typeof e.className === 'string' ? ` .${e.className.split(' ')[0].slice(0, 30)}` : ''}`)
        .filter((s) => !s.endsWith('""')).slice(0, 70);
      const files = [...document.querySelectorAll('input[type=file]')].map((e) => `accept=${e.accept || '-'} visible=${vis(e)}`);
      return { title: document.title, controls, files };
    });
    console.log(`URL: ${page.url()}`);
    console.log(`BASLIK: ${info.title}`);
    console.log(`KAPATILAN PENCERE: ${closed}`);
    console.log(`DOSYA ALANLARI (${info.files.length}): ${info.files.join(' | ') || '-'}`);
    console.log('KONTROLLER:');
    for (const c of info.controls) console.log(`  ${c}`);
    console.log(`GORUNTU: ${await shot('pencere-kapali')}`);
  } finally {
    await ctx.close().catch(() => {});
  }
}
main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
