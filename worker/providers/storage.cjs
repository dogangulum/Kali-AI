// Supabase Storage over REST (no SDK needed). Files must be publicly
// readable because Instagram fetches video_url/image_url itself.
const { providerError } = require('./errors.cjs');

function createStorage({ supabaseUrl, serviceKey, bucket, fetchImpl = fetch }) {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`;
  const auth = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  let bucketReady = false;

  async function ensureBucket() {
    if (bucketReady) return;
    const res = await fetchImpl(`${base}/bucket/${bucket}`, { headers: auth });
    if (res.status === 404 || res.status === 400) {
      const created = await fetchImpl(`${base}/bucket`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
      });
      if (!created.ok && created.status !== 409) throw providerError('STORAGE', `bucket create failed: ${created.status}`);
    }
    bucketReady = true;
  }

  const publicUrl = (path) => `${base}/object/public/${bucket}/${path}`;

  async function upload(path, body, contentType) {
    await ensureBucket();
    const res = await fetchImpl(`${base}/object/${bucket}/${path}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'true' }, body,
    });
    if (!res.ok) throw providerError('STORAGE', `upload ${path} failed: ${res.status} ${await res.text().catch(() => '')}`);
    return publicUrl(path);
  }

  async function list(prefix, { folders = false } = {}) {
    await ensureBucket();
    const res = await fetchImpl(`${base}/object/list/${bucket}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw providerError('STORAGE', `list ${prefix} failed: ${res.status}`);
    const rows = await res.json();
    const dir = prefix.replace(/\/+$/, '');
    if (folders) return rows.filter((r) => !r.id && r.name).map((r) => ({ name: r.name, path: `${dir}/${r.name}` }));
    return rows.filter((r) => r.id && r.name && !r.name.startsWith('.'))
      .map((r) => ({ name: r.name, path: `${prefix.replace(/\/+$/, '')}/${r.name}`, url: publicUrl(`${prefix.replace(/\/+$/, '')}/${r.name}`) }));
  }

  return { upload, list, publicUrl };
}

module.exports = { createStorage };
