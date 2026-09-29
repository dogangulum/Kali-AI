// Instagram Graph API: competitor discovery (business_discovery, official
// endpoint, public business/creator accounts only) and content publishing.
const { providerError } = require('./errors.cjs');

const GRAPH = 'https://graph.facebook.com/v20.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createInstagram({ igUserId, accessToken, fetchImpl = fetch, pollMs = 5000, maxPolls = 60 }) {
  async function graph(path, params = {}, method = 'GET') {
    const qs = new URLSearchParams({ ...params, access_token: accessToken });
    const res = await fetchImpl(`${GRAPH}/${path}${method === 'GET' ? `?${qs}` : ''}`, method === 'GET'
      ? {} : { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs.toString() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw providerError('GRAPH', `graph ${path}: ${json.error ? json.error.message : res.status}`);
    return json;
  }

  // Top videos of the given competitor accounts, best engagement first.
  async function findCompetitorVideos({ usernames }) {
    const out = [];
    for (const username of usernames || []) {
      try {
        const j = await graph(igUserId, {
          fields: `business_discovery.username(${username}){media.limit(30){id,media_type,media_product_type,media_url,permalink,caption,like_count,comments_count,timestamp}}`,
        });
        const media = (j.business_discovery && j.business_discovery.media && j.business_discovery.media.data) || [];
        for (const m of media) {
          if (m.media_type !== 'VIDEO' || !m.media_url) continue;
          out.push({
            source_url: m.permalink, media_url: m.media_url, account: username, caption: m.caption || '',
            engagement: (m.like_count || 0) + 2 * (m.comments_count || 0), timestamp: m.timestamp,
          });
        }
      } catch { /* a private/renamed account must not stop the others */ }
    }
    return out.sort((a, b) => b.engagement - a.engagement);
  }

  async function waitFinished(containerId) {
    for (let i = 0; i < maxPolls; i++) {
      const j = await graph(containerId, { fields: 'status_code,status' });
      if (j.status_code === 'FINISHED') return;
      if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw providerError('GRAPH', `container ${containerId}: ${j.status || j.status_code}`);
      await sleep(pollMs);
    }
    throw providerError('GRAPH', `container ${containerId} not ready in time`);
  }

  async function publishOne(params) {
    const c = await graph(`${igUserId}/media`, params, 'POST');
    await waitFinished(c.id);
    const p = await graph(`${igUserId}/media_publish`, { creation_id: c.id }, 'POST');
    return p.id;
  }

  // Reel (video + caption), story (same video), post (source image +
  // caption) when an image exists. Formats already published for this plan
  // are skipped, so a retry never double-posts.
  async function publish({ candidate, alreadyPublished = [], onPublished }) {
    const caption = [candidate.caption, (candidate.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
    const items = [];
    const plan = [
      ['reel', { media_type: 'REELS', video_url: candidate.video_url, caption, share_to_feed: 'true' }],
      ['story', { media_type: 'STORIES', video_url: candidate.video_url }],
      ...(candidate.image_url ? [['post', { image_url: candidate.image_url, caption }]] : []),
    ];
    for (const [format, params] of plan) {
      if (alreadyPublished.includes(format)) continue;
      const item = { format, mediaId: await publishOne(params) };
      items.push(item);
      if (onPublished) await onPublished(item); // persist before the next format can fail
    }
    return { items };
  }

  async function insights(mediaId, format) {
    const metrics = format === 'story' ? 'reach,replies,shares' : 'reach,likes,comments,saved,shares';
    const j = await graph(`${mediaId}/insights`, { metric: metrics });
    const v = Object.fromEntries((j.data || []).map((d) => [d.name, d.values && d.values[0] ? d.values[0].value : d.total_value && d.total_value.value]));
    return { reach: v.reach ?? null, likes: v.likes ?? null, comments: v.comments ?? v.replies ?? null, saves: v.saved ?? null, shares: v.shares ?? null };
  }

  return { findCompetitorVideos, publish, insights };
}

module.exports = { createInstagram };
