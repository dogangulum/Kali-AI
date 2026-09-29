// Loads the content pipeline's TypeScript modules into one sandbox (same
// strip-types + inline technique as webhook-suite.cjs) and provides a small
// generic in-memory Supabase stand-in.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const EXPORT_RE = /^export\s+/gm;
const IMPORT_RE = /^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm;

function loadContentPipeline() {
  const files = ['content-rules', 'telegram', 'content-approval-agent'];
  const code = files.map((name) => {
    const file = resolve(__dirname, `../../supabase/functions/_shared/${name}.ts`);
    return stripTypeScriptTypes(readFileSync(file, 'utf8')).replace(IMPORT_RE, '').replace(EXPORT_RE, '');
  }).join('\n');
  const names = [
    'resolvePipelineRules', 'localDate', 'zonedTimeToMs', 'addDays', 'pickNextTopic',
    'unseenCompetitorSources', 'candidateReward', 'learnFeatureWeights', 'scoreCandidates',
    'nextApprovalStep', 'approvalOutcome', 'publishOrder', 'bestPublishTime', 'effectiveCredits',
    'pickAccount', 'estimateCreditDays', 'shouldWarnLowCredit', 'retryDecision', 'CHANGE_LAYERS',
    'approvalKeyboard', 'changeKeyboard', 'parseCallbackData', 'secretMatches',
    'handleTelegramUpdate', 'runContentScheduler', 'creditReport',
  ];
  return runInNewContext(`${code}\n;({ ${names.join(', ')} });`, { console, Intl, Date }, { timeout: 2000 });
}

function getPath(row, key) {
  if (key.includes('->>')) {
    const [a, b] = key.split('->>');
    return row[a] == null ? undefined : String(row[a][b]);
  }
  return row[key];
}

function createDb(seed = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let seq = 0;
  const from = (table) => {
    tables[table] = tables[table] || [];
    const filters = [];
    let op = 'select';
    let payload = null;
    let limitN = Infinity;
    const q = {
      select() { return q; },
      insert(rows) { op = 'insert'; payload = rows; return q; },
      update(patch) { op = 'update'; payload = patch; return q; },
      eq(k, v) { filters.push((r) => getPath(r, k) === v); return q; },
      in(k, vs) { filters.push((r) => vs.includes(getPath(r, k))); return q; },
      gte(k, v) { filters.push((r) => getPath(r, k) >= v); return q; },
      lt(k, v) { filters.push((r) => getPath(r, k) < v); return q; },
      limit(n) { limitN = n; return q; },
      order() { return q; },
      maybeSingle() { return run().then(({ data, error }) => ({ data: data[0] || null, error })); },
      single() { return run().then(({ data, error }) => ({ data: data[0], error })); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      const rows = tables[table];
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload])
          .map((r) => ({ id: `gen-${++seq}`, created_at: new Date().toISOString(), ...r }));
        rows.push(...list);
        return { data: list, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r))).slice(0, limitN);
      if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
      return { data: hit.map((r) => ({ ...r })), error: null };
    }
    return q;
  };
  return { tables, client: { from } };
}

function recorder() {
  const calls = [];
  const send = async (method, body) => { calls.push({ method, body }); return {}; };
  return { calls, send };
}

module.exports = { loadContentPipeline, createDb, recorder };
