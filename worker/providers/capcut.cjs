// CapCut web automation (headless Chromium via Playwright). Brittle by
// design decision: when a step fails, the retry runner calls us again with
// refreshSelectors=true and we ask Claude to find the element again from a
// screenshot + the list of visible interactive elements, then persist the
// corrected selector. Each account uses its own browser profile directory,
// so its login session survives between runs.
const { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { providerError } = require('./errors.cjs');
const { callClaude, parseJson } = require('./claude.cjs');

function fill(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

function loadFlow(flowPath, overridesPath) {
  const flow = JSON.parse(readFileSync(flowPath, 'utf8'));
  const overrides = overridesPath && existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};
  for (const step of flow.steps) if (overrides[step.name]) step.selector = overrides[step.name];
  return { flow, overrides };
}

function saveOverride(overridesPath, overrides, stepName, selector) {
  if (!overridesPath) return;
  overrides[stepName] = selector;
  mkdirSync(dirname(overridesPath), { recursive: true });
  writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));
}

// Visible, interactive elements with a stable-ish selector each, for the
// self-heal prompt. Runs inside the page.
const COLLECT_ELEMENTS = () => {
  const out = [];
  const els = document.querySelectorAll('button, a, input, textarea, [role=button], [contenteditable=true], video');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if ((r.width === 0 || r.height === 0) && el.type !== 'file') continue;
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60);
    let sel = el.tagName.toLowerCase();
    if (el.id) sel = `#${CSS.escape(el.id)}`;
    else if (el.getAttribute('data-testid')) sel = `[data-testid="${el.getAttribute('data-testid')}"]`;
    else if (el.getAttribute('aria-label')) sel = `${sel}[aria-label="${el.getAttribute('aria-label')}"]`;
    else if (el.type === 'file') sel = 'input[type=file]';
    else if (text) sel = `${sel}:has-text("${text.replace(/"/g, '\\"').slice(0, 40)}")`;
    out.push({ selector: sel, tag: el.tagName.toLowerCase(), text });
    if (out.length >= 120) break;
  }
  return out;
};

function createCapCut({ env, flowPath, overridesPath, profilesDir, storage, anthropicApiKey, model, fetchImpl = fetch, launch }) {
  const doLaunch = launch || (async (userDataDir) => {
    const { chromium } = require('playwright');
    return chromium.launchPersistentContext(userDataDir, {
      headless: true, acceptDownloads: true, viewport: { width: 1440, height: 900 },
      executablePath: env.CHROMIUM_PATH || undefined,
    });
  });
  let lastShot = null; // PNG of the page at the last failure (browser is closed by then)

  async function heal(page, step) {
    const png = await page.screenshot({ type: 'png' });
    const elements = await page.evaluate(COLLECT_ELEMENTS);
    const text = await callClaude({
      apiKey: anthropicApiKey, model, fetchImpl, maxTokens: 300,
      system: 'You locate UI elements for browser automation. Answer with JSON only.',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(png).toString('base64') } },
        { type: 'text', text: `Step "${step.name}": ${step.description}\nPrevious selector that failed: ${step.selector}\nVisible elements:\n${JSON.stringify(elements)}\nPick the element for this step. Reply {"selector": "<one selector copied from the list>"} or {"selector": null} if it is not on screen.` },
      ],
    });
    const { selector } = parseJson(text);
    if (!selector || !elements.some((e) => e.selector === selector)) return null;
    return selector;
  }

  async function checkState(page, flow) {
    const body = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 20000) : '');
    if (new RegExp(flow.out_of_credit_pattern, 'i').test(body)) throw providerError('OUT_OF_CREDIT', 'capcut reports no credits left');
    for (const m of flow.login_markers || []) {
      if (await page.locator(m).first().isVisible().catch(() => false)) throw providerError('LOGIN_REQUIRED', 'capcut account is logged out');
    }
  }

  const videoSrcs = (page) => page.$$eval('video', (vs) => vs.map((v) => v.currentSrc || v.src || '').filter(Boolean));

  async function runStep(page, step, vars, flow) {
    const selector = step.selector;
    const timeout = step.timeoutMs || 30_000;
    switch (step.action) {
      case 'goto': await page.goto(fill(step.value, vars), { waitUntil: 'domcontentloaded', timeout: 60_000 }); return null;
      case 'wait': await page.waitForTimeout(step.ms || 3000); return null;
      // Close pop-ups / onboarding tours; never fails.
      case 'dismiss': {
        for (let round = 0; round < (step.rounds || 2); round++) {
          await page.keyboard.press('Escape').catch(() => {});
          for (const sel of step.selectors || []) {
            const el = page.locator(sel).first();
            if (await el.isVisible().catch(() => false)) {
              await el.click({ timeout: 3000, force: true }).catch(() => {});
              await page.waitForTimeout(600);
            }
          }
        }
        return null;
      }
      case 'upload': {
        const file = fill(step.value, vars);
        if (step.trigger) {
          try {
            const [chooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout }),
              page.click(step.trigger, { timeout, force: true }),
            ]);
            await chooser.setFiles(file);
            return null;
          } catch { /* fall back to a file input anywhere on the page */ }
        }
        await page.setInputFiles(selector, file, { timeout });
        return null;
      }
      case 'fill': await page.fill(selector, fill(step.value, vars), { timeout }); return null;
      // Rich text editors (ProseMirror/tiptap): focus, then type like a person.
      case 'type': {
        await page.click(selector, { timeout, force: true });
        await page.keyboard.type(fill(step.value, vars), { delay: 15 });
        return null;
      }
      case 'click': await page.click(selector, { timeout, force: Boolean(step.force) }); await checkState(page, flow); return null;
      case 'waitFor': await page.waitForSelector(selector, { timeout, state: 'visible' }); return null;
      // Remember which videos are already on the page (showcase clips), so the
      // generated one can be recognised later.
      case 'snapshotVideos': vars.__videosBefore = await videoSrcs(page).catch(() => []); return null;
      case 'waitNewVideo': {
        const before = new Set(vars.__videosBefore || []);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          await checkState(page, flow);
          const fresh = (await videoSrcs(page).catch(() => [])).find((src) => !before.has(src) && /^https?:/.test(src));
          if (fresh) { vars.__newVideo = fresh; return null; }
          await page.waitForTimeout(step.pollMs || 10_000);
        }
        throw providerError('CAPCUT_STEP', `no new video after ${Math.round(timeout / 1000)}s`);
      }
      case 'saveNewVideo': {
        if (!vars.__newVideo) throw providerError('CAPCUT_STEP', 'no generated video to save');
        const res = await page.request.get(vars.__newVideo, { timeout: 120_000 });
        if (!res.ok()) throw providerError('DOWNLOAD', `generated video ${res.status()}`);
        const out = join(profilesDir, `.clip-${Date.now()}.mp4`);
        writeFileSync(out, await res.body());
        vars.__tmpFiles = [...(vars.__tmpFiles || []), out];
        return out;
      }
      case 'download': {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click(selector, { timeout })]);
        return dl.path();
      }
      default: throw providerError('CONFIG', `unknown capcut action ${step.action}`);
    }
  }

  // Returns { url } of the generated clip uploaded to storage.
  async function generateVideo({ image, account, refreshSelectors, subTopic, scenario, variant }) {
    const { flow, overrides } = loadFlow(flowPath, overridesPath);
    const imagePath = join(profilesDir, `.src-${Date.now()}.jpg`);
    const slug = account.label.replace(/[^\w-]/g, '_');
    const context = await doLaunch(join(profilesDir, slug));
    let vars = null;
    try {
      // Session exported from a manual login (worker/scripts/capcut-login.cjs).
      const statePath = join(profilesDir, `${slug}.state.json`);
      if (existsSync(statePath) && context.addCookies) {
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        if (Array.isArray(state.cookies) && state.cookies.length) await context.addCookies(state.cookies);
      }
      const page = context.pages()[0] || await context.newPage();
      lastShot = null;
      const imgRes = await fetchImpl(image.url);
      if (!imgRes.ok) throw providerError('DOWNLOAD', `source image ${imgRes.status}`);
      writeFileSync(imagePath, Buffer.from(await imgRes.arrayBuffer()));
      const beats = scenario && Array.isArray(scenario.beats) ? scenario.beats.map((b) => `${b.shot || ''} ${b.camera || ''}`.trim()).join('; ') : '';
      vars = {
        start_url: flow.start_url, image_path: imagePath,
        prompt: `${subTopic}. ${beats || 'slow cinematic camera movement in a beauty salon'}. Keep the person's face unchanged.`.slice(0, 800),
      };
      let file = null;
      for (const step of flow.steps) {
        try {
          const r = await runStep(page, step, vars, flow);
          if (r) file = r;
        } catch (err) {
          if (step.optional && err.code !== 'OUT_OF_CREDIT' && err.code !== 'LOGIN_REQUIRED') continue;
          lastShot = await page.screenshot({ type: 'png' }).catch(() => null);
          if (err.code === 'OUT_OF_CREDIT' || err.code === 'LOGIN_REQUIRED') throw err;
          await checkState(page, flow);
          if (refreshSelectors && step.selector && anthropicApiKey) {
            const healed = await heal(page, step).catch(() => null);
            if (healed && healed !== step.selector) saveOverride(overridesPath, overrides, step.name, healed);
          }
          throw providerError('CAPCUT_STEP', `capcut step ${step.name} failed: ${err.message}`);
        }
      }
      if (!file) throw providerError('CAPCUT_STEP', 'no video downloaded');
      const url = await storage.upload(`capcut/${Date.now()}-${variant || 0}.mp4`, readFileSync(file), 'video/mp4');
      return { url, features: { video_source: 'capcut' } };
    } finally {
      rmSync(imagePath, { force: true });
      for (const f of (vars && vars.__tmpFiles) || []) rmSync(f, { force: true });
      await context.close().catch(() => {});
    }
  }

  async function screenshot({ step, attempt, planId }) {
    if (!lastShot) return null;
    const png = lastShot;
    lastShot = null;
    return storage.upload(`screenshots/${planId || 'x'}-${step}-${attempt}.png`, Buffer.from(png), 'image/png');
  }

  return { generateVideo, screenshot };
}

module.exports = { createCapCut, loadFlow, fill };
