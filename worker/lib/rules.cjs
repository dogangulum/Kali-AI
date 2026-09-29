// Loads the shared TypeScript rule modules (single source of truth with the
// Edge Functions) into Node by stripping types. Requires Node >= 22.13.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const SHARED = resolve(__dirname, '../../supabase/functions/_shared');
const strip = (name) => stripTypeScriptTypes(readFileSync(`${SHARED}/${name}.ts`, 'utf8'))
  .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm, '')
  .replace(/^export\s+/gm, '');

const NAMES = [
  'resolvePipelineRules', 'localDate', 'zonedTimeToMs', 'addDays', 'pickNextTopic',
  'unseenCompetitorSources', 'candidateReward', 'learnFeatureWeights', 'scoreCandidates',
  'approvalOutcome', 'publishOrder', 'bestPublishTime', 'effectiveCredits', 'pickAccount',
  'estimateCreditDays', 'retryDecision', 'CHANGE_LAYERS', 'approvalKeyboard', 'createTelegramSender',
];

module.exports = runInNewContext(
  `${strip('content-rules')}\n${strip('telegram')}\n;({ ${NAMES.join(', ')} });`,
  {},
);
