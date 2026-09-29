// Provider registry for the daily run. Each function is one external
// capability; the orchestrator (lib/daily-run.cjs) never talks to a vendor
// directly. A provider whose settings/secrets are missing throws a CONFIG
// error, so the run fails loudly (plan -> failed + Telegram alert) instead
// of doing something half-way.
//
//   findCompetitorVideos({ service, subTopic })        -> [{ source_url, media_url, account, caption }]
//   analyzeCompetitor({ video, service, subTopic })     -> { fit, reason?, scenario }
//   inventSubTopic({ service, avoid })                  -> string
//   writeCaption({ service, subTopic, scenario, variant, previous?, layer? })
//   generateImage(brief)                                -> { url }
//   generateVideo({ ...brief, image, account, refreshSelectors }) -> { url }   (OUT_OF_CREDIT / LOGIN_REQUIRED switch account)
//   generateVoiceover({ ...brief, script, account })    -> { url, creditsUsed }
//   pickMusic({ ...brief, previous? })                  -> { name, mood, url } | null
//   merge({ videoUrl, voiceoverUrl, music, caption })   -> { url }
//   publish({ plan, candidate, alreadyPublished, onPublished })
//   insights(mediaId, format)                           -> { reach, likes, comments, saves, shares }
//   screenshot({ step, attempt, planId })               -> url | null
const { resolve } = require('node:path');
const { providerError } = require('./errors.cjs');
const { createStorage } = require('./storage.cjs');
const { createClaudeProviders } = require('./claude.cjs');
const { createInstagram } = require('./instagram.cjs');
const { createElevenLabs } = require('./elevenlabs.cjs');
const { createMedia } = require('./media.cjs');
const { createLibrary } = require('./library.cjs');
const { createCapCut } = require('./capcut.cjs');

const DEFAULT_MODEL = 'claude-sonnet-5';

function missing(name, what) {
  return async () => { throw providerError('CONFIG', `${name}: ${what} is not configured`); };
}

function createProviders({ env, config, db, businessId, fetchImpl = fetch }) {
  const cp = (config && config.content_pipeline) || {};
  const storage = createStorage({
    supabaseUrl: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.CONTENT_BUCKET || 'content', fetchImpl,
  });
  const model = env.CONTENT_CLAUDE_MODEL || DEFAULT_MODEL;
  const claude = env.ANTHROPIC_API_KEY ? createClaudeProviders({ apiKey: env.ANTHROPIC_API_KEY, model, config, fetchImpl }) : null;
  const ig = env.IG_USER_ID && env.IG_PAGE_ACCESS_TOKEN
    ? createInstagram({ igUserId: env.IG_USER_ID, accessToken: env.IG_PAGE_ACCESS_TOKEN, fetchImpl }) : null;
  const media = createMedia({ storage, fetchImpl, musicVolume: Number(cp.music_volume || 0.15) });
  const library = createLibrary({ storage, db, businessId });
  const voice = createElevenLabs({
    env, voiceId: cp.elevenlabs_voice_id, modelId: cp.elevenlabs_model_id || 'eleven_multilingual_v2', storage, fetchImpl,
  });
  const capcut = createCapCut({
    env, storage, fetchImpl, model, anthropicApiKey: env.ANTHROPIC_API_KEY,
    flowPath: env.CAPCUT_FLOW_PATH || resolve(__dirname, '../../config/capcut-flow.json'),
    overridesPath: env.CAPCUT_SELECTOR_OVERRIDES || '/var/lib/kali-ai/state/capcut-selectors.json',
    profilesDir: env.CAPCUT_PROFILES_DIR || '/var/lib/kali-ai/state/capcut-profiles',
  });

  return {
    findCompetitorVideos: ig
      ? () => ig.findCompetitorVideos({ usernames: cp.competitor_instagram_usernames || [] })
      : missing('findCompetitorVideos', 'IG_USER_ID / IG_PAGE_ACCESS_TOKEN'),
    analyzeCompetitor: claude
      ? async ({ video, service, subTopic }) => claude.analyzeCompetitor({
        video, service, subTopic, frames: video.media_url ? await media.sampleFrames(video.media_url, 6) : [],
      })
      : missing('analyzeCompetitor', 'ANTHROPIC_API_KEY'),
    inventSubTopic: claude ? claude.inventSubTopic : missing('inventSubTopic', 'ANTHROPIC_API_KEY'),
    writeCaption: claude ? claude.writeCaption : missing('writeCaption', 'ANTHROPIC_API_KEY'),
    generateImage: library.generateImage,
    generateVideo: capcut.generateVideo,
    generateVoiceover: voice.generateVoiceover,
    pickMusic: library.pickMusic,
    merge: media.merge,
    publish: ig ? ig.publish : missing('publish', 'IG_USER_ID / IG_PAGE_ACCESS_TOKEN'),
    insights: ig ? ig.insights : null,
    screenshot: capcut.screenshot,
    estimateCredits: (provider, input) => (provider === 'elevenlabs'
      ? Math.max(1, String((input && input.script) || '').length)
      : Number(cp.capcut_credits_per_video || 1)),
  };
}

module.exports = { createProviders };
