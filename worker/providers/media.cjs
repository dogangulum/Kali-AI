// ffmpeg-based media steps: sample frames from a competitor video (for
// analysis) and merge video + voiceover + background music into the final
// Instagram-ready MP4 (H.264/AAC, faststart).
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { providerError } = require('./errors.cjs');

function run(bin, args, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(providerError('FFMPEG', `${bin} failed: ${String(stderr || err.message).slice(-500)}`));
      else resolve(stdout);
    });
  });
}

async function download(url, file, fetchImpl) {
  if (!/^https?:/.test(url)) { await writeFile(file, await readFile(url)); return file; } // local path (tests/library)
  const res = await fetchImpl(url);
  if (!res.ok) throw providerError('DOWNLOAD', `download ${url} failed: ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kali-media-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function createMedia({ storage, fetchImpl = fetch, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', musicVolume = 0.15 }) {
  async function duration(file) {
    const out = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    return Number(String(out).trim());
  }

  // n evenly spaced JPEG frames as base64 strings (max width 768px).
  async function sampleFrames(url, n = 6) {
    return withTmp(async (dir) => {
      const src = await download(url, join(dir, 'src.mp4'), fetchImpl);
      const d = await duration(src);
      const fps = Math.max(n / Math.max(d, 1), 0.05);
      await run(ffmpeg, ['-y', '-i', src, '-vf', `fps=${fps},scale='min(768,iw)':-2`, '-frames:v', String(n), '-q:v', '4', join(dir, 'f%02d.jpg')]);
      const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
      return Promise.all(files.map(async (f) => (await readFile(join(dir, f))).toString('base64')));
    });
  }

  async function merge({ videoUrl, voiceoverUrl, music, outName = `final/${Date.now()}.mp4` }) {
    return withTmp(async (dir) => {
      const video = await download(videoUrl, join(dir, 'v.mp4'), fetchImpl);
      const voice = voiceoverUrl ? await download(voiceoverUrl, join(dir, 'vo.mp3'), fetchImpl) : null;
      const bg = music && music.url ? await download(music.url, join(dir, 'm.mp3'), fetchImpl) : null;
      const args = ['-y', '-i', video];
      if (voice) args.push('-i', voice);
      if (bg) args.push('-stream_loop', '-1', '-i', bg);
      const out = join(dir, 'out.mp4');
      if (voice && bg) {
        args.push('-filter_complex', `[1:a]apad[vo];[2:a]volume=${musicVolume}[mu];[vo][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`, '-map', '0:v', '-map', '[a]');
      } else if (voice || bg) {
        args.push('-filter_complex', voice ? '[1:a]apad[a]' : `[1:a]volume=${musicVolume}[a]`, '-map', '0:v', '-map', '[a]');
      } else {
        args.push('-map', '0:v', '-an');
      }
      args.push('-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);
      await run(ffmpeg, args);
      const url = await storage.upload(outName, await readFile(out), 'video/mp4');
      return { url, duration: await duration(out) };
    });
  }

  return { sampleFrames, merge, duration };
}

module.exports = { createMedia };
