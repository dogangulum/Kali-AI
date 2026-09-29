// ElevenLabs text-to-speech. Each account's API key lives in an env var
// whose NAME is generation_accounts.credential_ref. Quota errors become
// OUT_OF_CREDIT so the credit pool moves on to the next account.
const { providerError } = require('./errors.cjs');

function createElevenLabs({ env, voiceId, modelId, storage, fetchImpl = fetch }) {
  async function generateVoiceover({ script, account, variant, subTopic }) {
    const key = env[account.credential_ref];
    if (!key) throw providerError('CONFIG', `env ${account.credential_ref} is not set`);
    if (!voiceId) throw providerError('CONFIG', 'content_pipeline.elevenlabs_voice_id is not set');
    const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: script, model_id: modelId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (/quota|credit|character_limit|limit_exceeded/i.test(body) || res.status === 402) {
        throw providerError('OUT_OF_CREDIT', `elevenlabs ${account.label}: ${body.slice(0, 200)}`);
      }
      throw providerError('ELEVENLABS', `elevenlabs ${res.status}: ${body.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    const url = await storage.upload(`voice/${Date.now()}-${variant || 0}.mp3`, audio, 'audio/mpeg');
    return { url, creditsUsed: script.length, features: { voice: voiceId } };
  }
  return { generateVoiceover };
}

module.exports = { createElevenLabs };
