// Disk cache. Every reel gets its own folder, keyed by its Instagram shortcode:
//   data/reels/<shortcode>/video.mp4        downloaded video (kept so re-analysis never re-downloads)
//   data/reels/<shortcode>/video.info.json  caption, creator, duration from yt-dlp
//   data/reels/<shortcode>/video.jpg        thumbnail
//   data/reels/<shortcode>/analysis.json    the AI result; if this exists the reel is never sent to the AI again
//   data/reels/<shortcode>/embedding.json   meaning fingerprint used to link related reels
//   data/cache/<kind>/<hash>.json           topic boards and weekly digests, keyed by their exact inputs
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;

export function isShortcode(value) {
  return typeof value === 'string' && SHORTCODE.test(value);
}

export function reelDir(shortcode) {
  if (!isShortcode(shortcode)) throw new Error(`Invalid reel id: ${shortcode}`);
  return path.join(config.dataDir, 'reels', shortcode);
}

export async function ensureReelDir(shortcode) {
  const dir = reelDir(shortcode);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

// Writes to the same file run one after another, each through its own temporary file,
// so two requests at the same moment can't trip over each other.
const queues = new Map();
function serial(key, task) {
  const run = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(task);
  queues.set(key, run);
  run.finally(() => queues.get(key) === run && queues.delete(key)).catch(() => undefined);
  return run;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function replaceFile(tmp, file) {
  // Windows briefly locks files (antivirus, search indexing, an editor), so retry a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(tmp, file);
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
      await wait(40 * (attempt + 1));
    }
  }
}

function writeJson(file, value) {
  return serial(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const text = JSON.stringify(value, null, 2);
    await fs.writeFile(tmp, text);
    try {
      await replaceFile(tmp, file);
    } catch {
      // Last resort: write in place, then tidy up.
      await fs.writeFile(file, text);
      await fs.rm(tmp, { force: true });
    }
  });
}

export const readAnalysis = (id) => readJson(path.join(reelDir(id), 'analysis.json'));
export const writeAnalysis = (id, value) => writeJson(path.join(reelDir(id), 'analysis.json'), value);
export const readEmbedding = (id) => readJson(path.join(reelDir(id), 'embedding.json'));
export const writeEmbedding = (id, value) => writeJson(path.join(reelDir(id), 'embedding.json'), value);

export function cacheKey(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}
export const readCached = (kind, key) => readJson(path.join(config.dataDir, 'cache', kind, `${key}.json`));
export const writeCached = (kind, key, value) => writeJson(path.join(config.dataDir, 'cache', kind, `${key}.json`), value);

export async function findVideo(shortcode) {
  const dir = reelDir(shortcode);
  if (!existsSync(dir)) return null;
  const files = await fs.readdir(dir);
  const video = files.find((f) => /^video\.(mp4|webm|mkv|mov)$/.test(f));
  return video ? path.join(dir, video) : null;
}

export async function readInfo(shortcode) {
  const info = await readJson(path.join(reelDir(shortcode), 'video.info.json'));
  if (!info) return null;
  return {
    caption: info.description || info.title || '',
    creator: info.uploader_id || info.channel || info.uploader || '',
    duration: info.duration || null,
    uploadDate: info.upload_date || null,
  };
}

/** Every reel the helper has notes for, newest first. Reads only the file dates, so it's quick. */
export async function listAnalyzed() {
  const root = path.join(config.dataDir, 'reels');
  if (!existsSync(root)) return [];
  const out = [];
  for (const id of await fs.readdir(root)) {
    if (!isShortcode(id)) continue;
    try {
      const stat = await fs.stat(path.join(root, id, 'analysis.json'));
      out.push({ shortcode: id, updatedAt: stat.mtime.toISOString() });
    } catch {
      /* not analyzed yet */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const inboxFile = () => path.join(config.dataDir, 'inbox.json');
export async function readInbox() {
  return (await readJson(inboxFile())) || [];
}
export async function writeInbox(items) {
  await writeJson(inboxFile(), items);
}
/** Read, change and save the inbox as one step, so reels sent at the same moment are never lost. */
export function updateInbox(change) {
  return serial('inbox-update', async () => {
    const next = await change(await readInbox());
    await writeInbox(next);
    return next;
  });
}

export function thumbPath(shortcode) {
  const dir = reelDir(shortcode);
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'heic']) {
    const file = path.join(dir, `video.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * The connect code that lets the hosted web app talk to this helper.
 * Created once and kept, so the browser stays connected across restarts.
 */
export function connectToken() {
  const file = path.join(config.dataDir, 'connect-code.txt');
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved.length >= 20) return saved;
  }
  mkdirSync(config.dataDir, { recursive: true });
  const token = randomBytes(18).toString('base64url');
  writeFileSync(file, token, { mode: 0o600 });
  return token;
}
