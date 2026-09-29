// Provider registry for the daily run. Each function is one external
// capability; the orchestrator (lib/daily-run.cjs) never talks to a vendor
// directly. Unimplemented providers throw NOT_IMPLEMENTED so a run fails
// loudly (plan -> failed + Telegram alert) instead of doing something
// half-way. Implementations land here one by one:
//
//   findCompetitorVideos({ service, subTopic })        -> [{ source_url, account }]
//   analyzeCompetitor({ video, service, subTopic })     -> { fit, reason?, scenario }
//   inventSubTopic({ service, avoid })                  -> string
//   writeCaption({ service, subTopic, scenario, variant, previous?, layer? })
//                                                       -> { caption, hashtags, voiceover_script?, features }
//   generateImage(brief)                                -> { url }
//   generateVideo({ ...brief, image, account, refreshSelectors })
//                                                       -> { url, features? }  (throw code OUT_OF_CREDIT to switch account)
//   generateVoiceover({ ...brief, script, account })    -> { url, features? }  (same)
//   pickMusic({ ...brief, previous? })                  -> { name, mood }
//   merge({ videoUrl, voiceoverUrl, music, caption })   -> { url }
//   publish({ plan, candidate })                        -> { items: [{ format, mediaId }] }
//   screenshot({ step, attempt, planId })               -> url (optional)

function notImplemented(name) {
  return async () => {
    const e = new Error(`provider "${name}" is not implemented yet`);
    e.code = 'NOT_IMPLEMENTED';
    throw e;
  };
}

const NAMES = [
  'findCompetitorVideos', 'analyzeCompetitor', 'inventSubTopic', 'writeCaption', 'generateImage',
  'generateVideo', 'generateVoiceover', 'pickMusic', 'merge', 'publish',
];

function createProviders(env) {
  const providers = {};
  for (const name of NAMES) providers[name] = notImplemented(name);
  providers.screenshot = null;
  providers.videoCredits = Number(env.CAPCUT_CREDITS_PER_VIDEO || 1);
  providers.voiceCredits = Number(env.ELEVENLABS_CREDITS_PER_VOICEOVER || 1);
  return providers;
}

module.exports = { createProviders, PROVIDER_NAMES: NAMES };
