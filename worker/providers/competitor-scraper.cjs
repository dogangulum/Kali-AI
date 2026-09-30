// Competitor videos through a separate Instagram account (instagrapi), used
// only when the official business_discovery endpoint returns nothing. The
// Python helper (worker/scripts/ig_scraper.py) logs in with its own
// throwaway account; the salon's account is never used here.
const { execFile } = require('node:child_process');
const { resolve } = require('node:path');
const { providerError } = require('./errors.cjs');

function runPython({ python, script, env, input, timeoutMs, execFileImpl }) {
  return new Promise((done) => {
    const child = execFileImpl(python, [script], { env, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => done({ err, stdout: String(stdout || '') }));
    if (child && child.stdin) { child.stdin.end(input); }
  });
}

function createCompetitorScraper({
  env, python = 'python3', script = resolve(__dirname, '../scripts/ig_scraper.py'),
  timeoutMs = 10 * 60_000, execFileImpl = execFile,
}) {
  const configured = Boolean(env.IG_SCRAPER_USERNAME && env.IG_SCRAPER_PASSWORD);

  async function findCompetitorVideos({ usernames }) {
    if (!configured) throw providerError('CONFIG', 'IG_SCRAPER_USERNAME / IG_SCRAPER_PASSWORD not set');
    if (!usernames || !usernames.length) return [];
    const childEnv = {
      PATH: env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: env.HOME || '/root',
      IG_SCRAPER_USERNAME: env.IG_SCRAPER_USERNAME, IG_SCRAPER_PASSWORD: env.IG_SCRAPER_PASSWORD,
      IG_SCRAPER_SESSION: env.IG_SCRAPER_SESSION || '/var/lib/kali-ai/state/ig-scraper-session.json',
      IG_SCRAPER_MEDIA_PER_ACCOUNT: env.IG_SCRAPER_MEDIA_PER_ACCOUNT || '30',
    };
    const { err, stdout } = await runPython({ python, script, env: childEnv, input: JSON.stringify(usernames), timeoutMs, execFileImpl });
    let parsed;
    try { parsed = JSON.parse(stdout.trim().split('\n').pop() || 'null'); } catch { parsed = null; }
    if (parsed && !Array.isArray(parsed) && parsed.error) {
      throw providerError(parsed.code === 'LOGIN' || parsed.code === 'RATE_LIMIT' ? 'LOGIN_REQUIRED' : 'SCRAPER', `rakip hesabi: ${parsed.error}`);
    }
    if (!Array.isArray(parsed)) throw providerError('SCRAPER', `rakip taramasi basarisiz${err ? `: ${err.message}` : ''}`);
    return parsed.filter((v) => v && v.source_url && v.media_url);
  }

  return { configured, findCompetitorVideos };
}

module.exports = { createCompetitorScraper };
