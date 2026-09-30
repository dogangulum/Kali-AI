const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createDb } = require('./helpers/content-pipeline.cjs');
const { createStorage } = require('../worker/providers/storage.cjs');
const { createClaudeProviders, parseJson } = require('../worker/providers/claude.cjs');
const { createInstagram } = require('../worker/providers/instagram.cjs');
const { createElevenLabs } = require('../worker/providers/elevenlabs.cjs');
const { createMedia } = require('../worker/providers/media.cjs');
const { createLibrary } = require('../worker/providers/library.cjs');
const { createCapCut } = require('../worker/providers/capcut.cjs');

const res = (status, body, raw) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  arrayBuffer: async () => (raw || Buffer.from('bytes')),
});

function fakeStorage() {
  const files = {};
  return {
    files,
    upload: async (path, body) => { files[path] = body; return `https://cdn/${path}`; },
    list: async () => [],
    publicUrl: (p) => `https://cdn/${p}`,
  };
}

test('storage: creates a public bucket once, uploads with upsert, returns public URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    if (url.endsWith('/bucket/content')) return res(404, {});
    return res(200, {});
  };
  const s = createStorage({ supabaseUrl: 'https://p.supabase.co/', serviceKey: 'k', bucket: 'content', fetchImpl });
  const url = await s.upload('a/b.mp4', Buffer.from('x'), 'video/mp4');
  await s.upload('a/c.mp4', Buffer.from('x'), 'video/mp4');
  assert.equal(url, 'https://p.supabase.co/storage/v1/object/public/content/a/b.mp4');
  assert.equal(calls.filter(([, u]) => u.endsWith('/bucket')).length, 1);
  assert.equal(calls.filter(([m, u]) => m === 'POST' && u.includes('/object/content/')).length, 2);
});

test('claude: caption JSON parsed, hashtags cleaned, features extracted; tags-only keeps text', async () => {
  let lastBody;
  const reply = { caption: 'Kışın cildiniz nem ister.', hashtags: ['#cilt', 'yanlış', '#kış bakım', '#hydrafacial'], voiceover_script: 'Ses metni', hook_style: 'soru', cta: 'dm' };
  const fetchImpl = async (_u, init) => { lastBody = JSON.parse(init.body); return res(200, { content: [{ type: 'text', text: `İşte:\n${JSON.stringify(reply)}` }] }); };
  const c = createClaudeProviders({ apiKey: 'k', model: 'm', config: { content_pipeline: { brand_name: 'Test' } }, fetchImpl });
  const out = await c.writeCaption({ service: 'Cilt', subTopic: 'Kış', variant: 1 });
  assert.equal(out.caption, reply.caption);
  assert.deepEqual(out.hashtags, ['#cilt', '#hydrafacial']);
  assert.equal(out.features.hook, 'soru');
  assert.match(lastBody.system, /Marka: Test/);
  const tags = await c.writeCaption({ service: 'Cilt', subTopic: 'Kış', variant: 1, layer: 'tags', previous: { caption: 'ESKİ METİN', hashtags: ['#a'] } });
  assert.equal(tags.caption, 'ESKİ METİN');
  assert.match(lastBody.messages[0].content[0].text, /Metni aynen koru/);
  assert.throws(() => parseJson('no json here'), /no JSON/);
});

test('claude: competitor analysis sends frames as images and returns verdict', async () => {
  let body;
  const fetchImpl = async (_u, init) => { body = JSON.parse(init.body); return res(200, { content: [{ type: 'text', text: '{"fit": false, "reason": "oto yıkama", "scenario": {}}' }] }); };
  const c = createClaudeProviders({ apiKey: 'k', model: 'm', config: {}, fetchImpl });
  const v = await c.analyzeCompetitor({ video: { caption: 'x' }, service: 'Tırnak', subTopic: 'Protez', frames: ['AAA', 'BBB'] });
  assert.equal(v.fit, false);
  assert.equal(body.messages[0].content.filter((b) => b.type === 'image').length, 2);
});

test('instagram: competitor videos filtered to VIDEO and sorted by engagement; bad account skipped', async () => {
  const fetchImpl = async (url) => {
    if (decodeURIComponent(url).includes('username(gizli)')) return res(400, { error: { message: 'not business' } });
    return res(200, { business_discovery: { media: { data: [
      { media_type: 'IMAGE', media_url: 'i', permalink: 'p0' },
      { media_type: 'VIDEO', media_url: 'v1', permalink: 'p1', like_count: 10, comments_count: 1 },
      { media_type: 'VIDEO', media_url: 'v2', permalink: 'p2', like_count: 50, comments_count: 5 },
    ] } } });
  };
  const ig = createInstagram({ igUserId: '1', accessToken: 't', fetchImpl });
  const out = await ig.findCompetitorVideos({ usernames: ['gizli', 'rakip'] });
  assert.deepEqual(out.map((o) => o.source_url), ['p2', 'p1']);
});

test('instagram: publishes reel, story, post; waits for container; skips already published; persists each', async () => {
  const posts = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST') {
      const p = new URLSearchParams(init.body);
      posts.push([url.split('/v20.0/')[1], Object.fromEntries(p)]);
      if (url.endsWith('/media')) return res(200, { id: `c-${posts.length}` });
      return res(200, { id: `m-${p.get('creation_id')}` });
    }
    polls++;
    return res(200, { status_code: polls % 2 ? 'IN_PROGRESS' : 'FINISHED' });
  };
  const ig = createInstagram({ igUserId: '1', accessToken: 't', fetchImpl, pollMs: 1 });
  const saved = [];
  await ig.publish({
    candidate: { video_url: 'https://v', image_url: 'https://i', caption: 'Metin', hashtags: ['#a'] },
    alreadyPublished: ['story'], onPublished: async (i) => saved.push(i.format),
  });
  assert.deepEqual(saved, ['reel', 'post']);
  const reel = posts.find(([, b]) => b.media_type === 'REELS')[1];
  assert.equal(reel.caption, 'Metin\n\n#a');
  assert.equal(posts.filter(([u]) => u.endsWith('media_publish')).length, 2);
});

test('instagram: container error stops publishing', async () => {
  const fetchImpl = async (url, init = {}) => (init.method === 'POST' ? res(200, { id: 'c1' }) : res(200, { status_code: 'ERROR', status: 'bad video' }));
  const ig = createInstagram({ igUserId: '1', accessToken: 't', fetchImpl, pollMs: 1 });
  await assert.rejects(ig.publish({ candidate: { video_url: 'v', caption: 'c' } }), /bad video/);
});

test('elevenlabs: quota error becomes OUT_OF_CREDIT; success uploads mp3 and reports chars', async () => {
  const storage = fakeStorage();
  const account = { label: 'el1', credential_ref: 'EL_KEY_1' };
  const bad = createElevenLabs({ env: { EL_KEY_1: 'k' }, voiceId: 'v', modelId: 'm', storage, fetchImpl: async () => res(401, '{"detail":{"status":"quota_exceeded"}}') });
  await assert.rejects(bad.generateVoiceover({ script: 'merhaba', account }), (e) => e.code === 'OUT_OF_CREDIT');
  const good = createElevenLabs({ env: { EL_KEY_1: 'k' }, voiceId: 'v', modelId: 'm', storage, fetchImpl: async () => res(200, {}, Buffer.from('mp3')) });
  const out = await good.generateVoiceover({ script: 'merhaba', account, variant: 1 });
  assert.equal(out.creditsUsed, 7);
  assert.match(out.url, /voice\//);
  const noKey = createElevenLabs({ env: {}, voiceId: 'v', modelId: 'm', storage });
  await assert.rejects(noKey.generateVoiceover({ script: 'x', account }), /EL_KEY_1/);
});

test('media: real ffmpeg merge of video + voiceover + looped music, and frame sampling', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kali-test-'));
  const v = join(dir, 'v.mp4'); const vo = join(dir, 'vo.mp3'); const m = join(dir, 'm.mp3');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x568:rate=30', '-t', '4', '-pix_fmt', 'yuv420p', v], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', vo], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220', '-t', '1', m], { stdio: 'ignore' });
  const storage = fakeStorage();
  const media = createMedia({ storage });
  const out = await media.merge({ videoUrl: v, voiceoverUrl: vo, music: { url: m }, outName: 'final/t.mp4' });
  assert.ok(Math.abs(out.duration - 4) < 0.3, `duration ${out.duration}`);
  const file = join(dir, 'out.mp4');
  writeFileSync(file, storage.files['final/t.mp4']);
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]).toString().trim().split(/\r?\n/);
  assert.deepEqual(streams.sort(), ['aac', 'h264']);
  const frames = await media.sampleFrames(v, 3);
  assert.equal(frames.length, 3);
});

test('library: reference photo rotation avoids recently used; no music -> null', async () => {
  const db = createDb({ content_candidates: [{ business_id: 'b', image_url: 'https://cdn/reference/1.jpg' }] });
  const storage = {
    list: async (prefix) => (prefix === 'reference'
      ? ['1.jpg', '2.jpg'].map((n) => ({ name: n, url: `https://cdn/reference/${n}` })) : []),
  };
  const lib = createLibrary({ storage, db: db.client, businessId: 'b', random: () => 0 });
  assert.equal((await lib.generateImage({})).url, 'https://cdn/reference/2.jpg');
  assert.equal(await lib.pickMusic({}), null);
  const empty = createLibrary({ storage: { list: async () => [] }, db: db.client, businessId: 'b' });
  await assert.rejects(empty.generateImage({}), /reference/);
});

function fakeBrowser({ bodyText = '', failSelector = null, visibleLogin = false } = {}) {
  const log = [];
  const page = {
    goto: async (u) => log.push(['goto', u]),
    setInputFiles: async (s) => { if (s === failSelector) throw new Error('timeout'); log.push(['upload', s]); },
    fill: async (s, v) => { if (s === failSelector) throw new Error('timeout'); log.push(['fill', s, v]); },
    click: async (s) => { if (s === failSelector) throw new Error('timeout'); log.push(['click', s]); },
    waitForSelector: async (s) => { if (s === failSelector) throw new Error('timeout'); },
    waitForEvent: async () => ({ path: async () => __filename }),
    evaluate: async (fn) => (fn.toString().includes('innerText.slice') ? bodyText
      : [{ selector: 'button:has-text("Oluştur")', tag: 'button', text: 'Oluştur' }]),
    locator: () => ({ first: () => ({ isVisible: async () => visibleLogin }) }),
    screenshot: async () => Buffer.from('png'),
  };
  return { log, launch: async () => ({ pages: () => [page], newPage: async () => page, close: async () => {} }) };
}

function capcut(browser, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kali-cc-'));
  const storage = fakeStorage();
  const fetchImpl = async (url, init) => (url.includes('anthropic')
    ? res(200, { content: [{ type: 'text', text: '{"selector": "button:has-text(\\"Oluştur\\")"}' }] })
    : res(200, {}, Buffer.from('jpg')));
  const cc = createCapCut({
    env: {}, storage, fetchImpl, launch: browser.launch, model: 'm', anthropicApiKey: 'k',
    flowPath: join(__dirname, '../config/capcut-flow.json'), overridesPath: join(dir, 'ov.json'), profilesDir: dir, ...extra,
  });
  return { cc, storage, dir };
}

const account = { label: 'cc 1' };

test('capcut: runs the flow and uploads the downloaded clip', async () => {
  const b = fakeBrowser();
  const { cc, storage } = capcut(b);
  const out = await cc.generateVideo({ image: { url: 'https://img' }, account, subTopic: 'Protez tırnak', variant: 2 });
  assert.match(out.url, /capcut\//);
  assert.equal(Object.keys(storage.files).length, 1);
  assert.ok(b.log.some(([a, , v]) => a === 'fill' && /Protez tırnak/.test(v)));
});

test('capcut: failed selector -> screenshot kept, Claude heals it on retry, override saved', async () => {
  const b = fakeBrowser({ failSelector: "button:has-text('Generate')" });
  const { cc, dir } = capcut(b);
  await assert.rejects(cc.generateVideo({ image: { url: 'u' }, account, subTopic: 's', refreshSelectors: false }), /generate/);
  assert.equal(existsSync(join(dir, 'ov.json')), false);
  assert.match(await cc.screenshot({ step: 'capcut_video', attempt: 1, planId: 'p' }), /screenshots\//);
  await assert.rejects(cc.generateVideo({ image: { url: 'u' }, account, subTopic: 's', refreshSelectors: true }), /generate/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'ov.json'), 'utf8')).generate, 'button:has-text("Oluştur")');
  // next run uses the healed selector and succeeds
  const out = await cc.generateVideo({ image: { url: 'u' }, account, subTopic: 's' });
  assert.match(out.url, /capcut\//);
});

test('capcut: credit message -> OUT_OF_CREDIT; login screen -> LOGIN_REQUIRED', async () => {
  const noCredit = capcut(fakeBrowser({ bodyText: 'Oops, you have insufficient credits to continue' })).cc;
  await assert.rejects(noCredit.generateVideo({ image: { url: 'u' }, account, subTopic: 's' }), (e) => e.code === 'OUT_OF_CREDIT');
  const loggedOut = capcut(fakeBrowser({ visibleLogin: true })).cc;
  await assert.rejects(loggedOut.generateVideo({ image: { url: 'u' }, account, subTopic: 's' }), (e) => e.code === 'LOGIN_REQUIRED');
});

// --- competitor scraper fallback (separate Instagram account) ---
const { createCompetitorScraper } = require('../worker/providers/competitor-scraper.cjs');
const { createProviders } = require('../worker/providers/index.cjs');

function fakeExec(stdout, seen = {}) {
  return (cmd, args, opts, cb) => {
    seen.cmd = cmd; seen.env = opts.env;
    const stdin = { end: (input) => { seen.input = input; setImmediate(() => cb(null, stdout)); } };
    return { stdin };
  };
}

test('scraper: parses videos, passes only its own credentials, never runs unconfigured', async () => {
  const seen = {};
  const videos = [{ source_url: 'https://www.instagram.com/reel/A/', media_url: 'https://cdn/a.mp4', account: 'rakip', engagement: 50 },
    { source_url: 'https://www.instagram.com/reel/B/' }];
  const s = createCompetitorScraper({
    env: { IG_SCRAPER_USERNAME: 'yan', IG_SCRAPER_PASSWORD: 'p', SUPABASE_SERVICE_ROLE_KEY: 'gizli' },
    execFileImpl: fakeExec(`warning line\n${JSON.stringify(videos)}\n`, seen),
  });
  const out = await s.findCompetitorVideos({ usernames: ['rakip'] });
  assert.deepEqual(out.map((v) => v.source_url), ['https://www.instagram.com/reel/A/']);
  assert.deepEqual(JSON.parse(seen.input), ['rakip']);
  assert.equal(seen.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(seen.env.IG_SCRAPER_USERNAME, 'yan');
  const off = createCompetitorScraper({ env: {}, execFileImpl: () => { throw new Error('must not run'); } });
  assert.equal(off.configured, false);
  await assert.rejects(off.findCompetitorVideos({ usernames: ['x'] }), /IG_SCRAPER_USERNAME/);
});

test('scraper: login challenge becomes LOGIN_REQUIRED', async () => {
  const s = createCompetitorScraper({
    env: { IG_SCRAPER_USERNAME: 'yan', IG_SCRAPER_PASSWORD: 'p' },
    execFileImpl: fakeExec('{"error":"login/challenge: ChallengeRequired","code":"LOGIN"}'),
  });
  await assert.rejects(s.findCompetitorVideos({ usernames: ['rakip'] }), (e) => e.code === 'LOGIN_REQUIRED');
});

test('providers: Graph API first, scraper only when Graph returns nothing; failure notifies and continues', async () => {
  const config = { content_pipeline: { competitor_instagram_usernames: ['rakip'] } };
  const env = { IG_USER_ID: '1', IG_PAGE_ACCESS_TOKEN: 't', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const denied = async () => res(400, { error: { message: '(#10) Application does not have permission' } });
  const calls = [];
  const scraper = { configured: true, findCompetitorVideos: async ({ usernames }) => { calls.push(usernames); return [{ source_url: 's', media_url: 'm' }]; } };
  const p = createProviders({ env, config, db: createDb({}), businessId: 'b', fetchImpl: denied, scraper });
  assert.deepEqual((await p.findCompetitorVideos({})).map((v) => v.source_url), ['s']);
  assert.deepEqual(calls, [['rakip']]);

  const graphOk = async () => res(200, { business_discovery: { media: { data: [{ media_type: 'VIDEO', media_url: 'g', permalink: 'graph', like_count: 1 }] } } });
  const p2 = createProviders({ env, config, db: createDb({}), businessId: 'b', fetchImpl: graphOk, scraper });
  assert.deepEqual((await p2.findCompetitorVideos({})).map((v) => v.source_url), ['graph']);
  assert.equal(calls.length, 1);

  const notes = [];
  const broken = { configured: true, findCompetitorVideos: async () => { throw new Error('rakip hesabi: login'); } };
  const p3 = createProviders({ env, config, db: createDb({}), businessId: 'b', fetchImpl: denied, scraper: broken, notify: async (t) => notes.push(t) });
  assert.deepEqual(await p3.findCompetitorVideos({}), []);
  assert.match(notes[0], /Rakip videoları alınamadı/);
});
