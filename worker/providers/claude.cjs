// Claude-backed text providers: captions/voiceover scripts, fresh
// sub-topics, and competitor scenario analysis from sampled frames.
const { providerError } = require('./errors.cjs');

const URL_ = 'https://api.anthropic.com/v1/messages';

async function callClaude({ apiKey, model, system, content, maxTokens = 1200, fetchImpl }) {
  const res = await fetchImpl(URL_, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw providerError('CLAUDE', `claude ${res.status}: ${json.error && json.error.message || ''}`);
  return (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw providerError('CLAUDE_FORMAT', 'no JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

function brandContext(config) {
  const style = (config && config.conversation_style) || {};
  const cp = (config && config.content_pipeline) || {};
  return [
    cp.brand_name ? `Marka: ${cp.brand_name}` : null,
    cp.city ? `Şehir: ${cp.city}` : null,
    style.tone ? `Ton: ${style.tone}` : null,
    style.address_form ? `Hitap: ${style.address_form}` : null,
    cp.brand_colors ? `Marka renkleri: ${[].concat(cp.brand_colors).join(', ')}` : null,
    Array.isArray(cp.caption_rules) ? `Kurallar:\n- ${cp.caption_rules.join('\n- ')}` : null,
  ].filter(Boolean).join('\n');
}

function lengthBucket(n) { return n < 150 ? 'short' : n < 400 ? 'medium' : 'long'; }

function createClaudeProviders({ apiKey, model, config, fetchImpl = fetch }) {
  const call = (system, content, maxTokens) => callClaude({ apiKey, model, system, content, maxTokens, fetchImpl });
  const system = `Sen bir güzellik merkezinin Instagram içerik editörüsün. Türkçe yazarsın. Sağlık vaadi, kesin sonuç garantisi, fiyat ve indirim uydurmazsın.\n${brandContext(config)}`;

  async function writeCaption({ service, subTopic, scenario, variant, previous, layer }) {
    const keep = previous && layer === 'tags' ? `Metni aynen koru: """${previous.caption}"""\nSadece hashtag'leri yenile, öncekilerden farklı olsun: ${(previous.hashtags || []).join(' ')}` : '';
    const redoText = previous && layer === 'text' ? `Önceki metin beğenilmedi, farklı bir açıdan yaz: """${previous.caption}"""` : '';
    const text = await call(system, [{
      type: 'text',
      text: `Hizmet: ${service}\nAlt konu: ${subTopic}\nVaryant: ${variant}\n${scenario ? `Senaryo iskeleti (sadece yapı): ${JSON.stringify(scenario)}` : ''}\n${keep}\n${redoText}\n` +
        'Reel için yaz. Sadece şu JSON\'u döndür: {"caption": "...", "hashtags": ["#..."], "voiceover_script": "20-35 saniyelik seslendirme metni", "hook_style": "soru|iddia|önce-sonra|ipucu|hikaye", "cta": "dm|randevu|kaydet"}',
    }]);
    const j = parseJson(text);
    const caption = keep ? previous.caption : String(j.caption || '').trim();
    if (!caption) throw providerError('CLAUDE_FORMAT', 'empty caption');
    const hashtags = (Array.isArray(j.hashtags) ? j.hashtags : []).map((h) => String(h).trim()).filter((h) => /^#\S+$/.test(h)).slice(0, 15);
    return {
      caption, hashtags,
      voiceover_script: keep ? previous.voiceover_script || caption : String(j.voiceover_script || caption),
      features: { hook: j.hook_style || null, cta: j.cta || null, caption_len: lengthBucket(caption.length) },
    };
  }

  async function inventSubTopic({ service, avoid }) {
    const text = await call(system, [{
      type: 'text',
      text: `Hizmet: ${service}\nDaha önce işlenen alt konular: ${avoid.join(', ') || '-'}\nBunlardan farklı, müşterinin ilgisini çekecek yeni bir alt konu öner. Sadece {"sub_topic": "..."} döndür.`,
    }], 200);
    const s = String(parseJson(text).sub_topic || '').trim();
    if (!s) throw providerError('CLAUDE_FORMAT', 'empty sub_topic');
    return s;
  }

  // frames: base64 JPEGs sampled from the competitor video.
  async function analyzeCompetitor({ video, service, subTopic, frames = [] }) {
    const content = frames.slice(0, 6).map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
    content.push({
      type: 'text',
      text: `Bu kareler bir rakibin Instagram videosundan. Açıklaması: """${(video.caption || '').slice(0, 1500)}"""\n` +
        `Bizim konumuz: ${service} / ${subTopic}.\nGörüntüyü değil sadece senaryo ve kurgu yapısını (kanca, sahne sırası, kamera hareketleri, ritim, anlatı) kopyalayacağız; kendi salonumuz, kendi yüzümüz ve logomuzla çekilecek.\n` +
        'Bu yapı bizim konumuza uyar mı? Başka sektör, uygunsuz içerik, sadece ürün satışı, uyarlanamayacak kadar kişiye özel ise uymaz. ' +
        'Sadece JSON döndür: {"fit": true|false, "reason": "...", "scenario": {"hook": "...", "beats": [{"sec": 0, "shot": "...", "camera": "...", "text_overlay": "..."}], "pacing": "hızlı|orta|yavaş", "duration_sec": 0}}',
    });
    const j = parseJson(await call(system, content, 1500));
    return { fit: j.fit === true, reason: j.reason || null, scenario: j.scenario || {} };
  }

  return { writeCaption, inventSubTopic, analyzeCompetitor };
}

module.exports = { createClaudeProviders, callClaude, parseJson };
