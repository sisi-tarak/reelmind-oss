// Rebuilds a reel's cover image when yt-dlp didn't save one (or it was deleted):
// first from a frame of the saved video, then from the thumbnail link in the saved video info.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { findVideo, thumbPath, thumbUrl } from './store.js';
import { detectTools, run } from './tools.js';

const tried = new Map();
const RETRY_MS = 10 * 60 * 1000;
const inflight = new Map();

async function fromVideo(shortcode, target) {
  const video = await findVideo(shortcode);
  if (!video || !(await detectTools()).ffmpeg.found) return false;
  const result = await run(config.ffmpegBin, ['-y', '-v', 'error', '-ss', '1', '-i', video, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', target], { timeoutMs: 30000 });
  return result.code === 0;
}

async function fromLink(shortcode, target) {
  const url = await thumbUrl(shortcode);
  if (!url) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return false;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 500 || bytes.length > 8 * 1024 * 1024) return false;
    await fs.writeFile(target, bytes);
    return true;
  } catch {
    return false;
  }
}

/** The cover's file path, making one if possible. Gives up for 10 minutes after a failed attempt. */
export function ensureThumb(shortcode) {
  const existing = thumbPath(shortcode);
  if (existing) return Promise.resolve(existing);
  if (config.demo) return Promise.resolve(null);
  const last = tried.get(shortcode);
  if (last && Date.now() - last < RETRY_MS) return Promise.resolve(null);
  if (inflight.has(shortcode)) return inflight.get(shortcode);
  const job = (async () => {
    tried.set(shortcode, Date.now());
    const dir = path.join(config.dataDir, 'reels', shortcode);
    try {
      await fs.access(dir);
    } catch {
      return null;
    }
    const target = path.join(dir, 'video.jpg');
    const ok = (await fromVideo(shortcode, target)) || (await fromLink(shortcode, target));
    return ok ? thumbPath(shortcode) : null;
  })().finally(() => inflight.delete(shortcode));
  inflight.set(shortcode, job);
  return job;
}
