// Brand asset libraries kept in Supabase Storage:
//   reference/  -> the brand's own photos (face reference, salon shots)
//   music/<mood>/ -> royalty-free background tracks, one folder per mood
// Picks rotate so the same photo/track is not reused back to back.
const { providerError } = require('./errors.cjs');

function createLibrary({ storage, db, businessId, random = Math.random }) {
  async function recentlyUsed(column, limit = 30) {
    const { data } = await db.from('content_candidates').select(column).eq('business_id', businessId);
    return new Set((data || []).map((r) => r[column]).filter(Boolean).slice(-limit));
  }

  // Until an AI image generator is chosen, the "source image" is one of the
  // brand's own reference photos (least recently used first).
  async function generateImage({ previous }) {
    const photos = await storage.list('reference');
    if (!photos.length) throw providerError('CONFIG', 'storage reference/ has no photos yet');
    const used = await recentlyUsed('image_url');
    const fresh = photos.filter((p) => !used.has(p.url) && p.url !== previous);
    const pool = fresh.length ? fresh : photos.filter((p) => p.url !== previous);
    const pick = (pool.length ? pool : photos)[Math.floor(random() * (pool.length || photos.length))];
    return { url: pick.url, features: { image_source: 'reference' } };
  }

  async function pickMusic({ previous }) {
    const moods = (await storage.list('music', { folders: true })).map((m) => m.name);
    if (!moods.length) return null; // no music library: voiceover only
    const tracks = [];
    for (const mood of moods) {
      for (const t of await storage.list(`music/${mood}`)) tracks.push({ name: t.name, mood, url: t.url });
    }
    if (!tracks.length) return null;
    const used = await recentlyUsed('music', 10);
    const pool = tracks.filter((t) => t.name !== previous && !used.has(t.name));
    const list = pool.length ? pool : tracks.filter((t) => t.name !== previous);
    const final = list.length ? list : tracks;
    return final[Math.floor(random() * final.length)];
  }

  return { generateImage, pickMusic };
}

module.exports = { createLibrary };
