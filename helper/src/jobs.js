// Runs one batch at a time.
//   kind "analyze": each reel moves queued -> fetching -> analyzing -> done (or cached / failed / pending).
//     A reel that already has analysis.json on disk is returned as "cached": no download, no AI call.
//     force=true (Re-analyze) is the only way to analyze a reel twice, and the app asks first.
//   kind "link": computes the meaning fingerprint (embedding) for reels that don't have one yet.
import { randomUUID } from 'node:crypto';
import { config, providerReady } from './config.js';
import { fetchReel } from './fetcher.js';
import { analyzeReel, RateLimitError, sleep } from './analyzer.js';
import { embedText } from './ai.js';
import { demoEmbedding } from './boards.js';
import { demoAnalysis, demoInfo } from './demo.js';
import { embeddingText } from './prompt.js';
import { isShortcode, readAnalysis, readEmbedding, writeAnalysis, writeEmbedding } from './store.js';

const jobs = new Map();
let current = null;

export function getJob(id) {
  return jobs.get(id) || null;
}

export function getCurrentJob() {
  return current && jobs.get(current) ? jobs.get(current) : null;
}

export function isBusy() {
  const job = getCurrentJob();
  return Boolean(job && job.status === 'running');
}

// Results are fetched separately (POST /api/analyses), so polling stays small even for 200-reel batches.
export function serializeJob(job) {
  if (!job) return null;
  const { controller, items, ...rest } = job;
  return { ...rest, items: items.map(({ result, ...item }) => item) };
}

function count(job) {
  const c = { total: job.items.length, done: 0, cached: 0, failed: 0, pending: 0, active: 0 };
  for (const item of job.items) {
    if (item.step === 'done') c.done += 1;
    else if (item.step === 'cached') c.cached += 1;
    else if (item.step === 'failed') c.failed += 1;
    else if (item.step === 'queued' || item.step === 'pending') c.pending += 1;
    else c.active += 1;
  }
  job.counts = c;
}

export function startJob(reels, { provider = config.defaultProvider, force = false, kind = 'analyze' } = {}) {
  if (isBusy()) {
    const error = new Error('A batch is already running. Wait for it to finish or cancel it.');
    error.status = 409;
    throw error;
  }
  provider = provider === 'claude' ? 'claude' : 'gemini';
  if (kind === 'analyze' && !providerReady(provider)) {
    const error = new Error(provider === 'claude' ? 'No Claude key. Add ANTHROPIC_API_KEY to helper/.env and restart the helper.' : 'No Gemini key. Add GEMINI_API_KEY to helper/.env and restart the helper.');
    error.status = 400;
    throw error;
  }
  const seen = new Set();
  const items = [];
  for (const r of reels || []) {
    if (!r || !isShortcode(r.shortcode) || seen.has(r.shortcode)) continue;
    seen.add(r.shortcode);
    items.push({
      shortcode: r.shortcode,
      url: `https://www.instagram.com/reel/${r.shortcode}/`,
      creator: typeof r.creator === 'string' ? r.creator.slice(0, 100) : '',
      // Kept with the analysis so any browser that loads it later knows when the reel was saved.
      savedAt: typeof r.savedAt === 'string' && !Number.isNaN(Date.parse(r.savedAt)) ? new Date(r.savedAt).toISOString() : null,
      collections: Array.isArray(r.collections) ? r.collections.filter((c) => typeof c === 'string').slice(0, 10).map((c) => c.slice(0, 80)) : [],
      step: 'queued',
      error: null,
      result: null,
    });
  }
  if (!items.length) {
    const error = new Error('No valid reels in this request.');
    error.status = 400;
    throw error;
  }
  const job = {
    id: randomUUID(),
    kind: kind === 'link' ? 'link' : 'analyze',
    provider,
    force: Boolean(force),
    status: 'running',
    message: null,
    demo: config.demo,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    items,
    counts: null,
    controller: new AbortController(),
  };
  count(job);
  jobs.set(job.id, job);
  current = job.id;
  runJob(job).catch((error) => {
    job.status = 'error';
    job.message = String(error?.message || error);
    job.finishedAt = new Date().toISOString();
  });
  return job;
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'running') return job;
  job.controller.abort();
  return job;
}

async function embedFor(analysis, signal) {
  if (config.demo) return demoEmbedding(analysis);
  try {
    return await embedText(embeddingText(analysis), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null; // Links fall back to shared tags; "Build links" can fill this in later.
  }
}

async function analyzeItem(job, item) {
  const signal = job.controller.signal;
  const prior = await readAnalysis(item.shortcode);
  if (prior && !job.force) {
    // Fill in a save date the helper didn't know yet, so other browsers get it too.
    if (!prior.savedAt && item.savedAt) await writeAnalysis(item.shortcode, { ...prior, savedAt: item.savedAt });
    item.step = 'cached';
    return;
  }

  item.step = 'fetching';
  let fetched;
  if (config.demo) {
    await sleep(300, signal);
    fetched = { videoPath: null, info: demoInfo(item), captionOnly: false };
  } else {
    fetched = await fetchReel(item);
  }

  item.step = 'analyzing';
  let analysis;
  if (config.demo) {
    await sleep(550, signal);
    analysis = { ...demoAnalysis(item), source: 'video' };
  } else {
    analysis = await analyzeReel({
      provider: job.provider,
      videoPath: fetched.videoPath,
      caption: fetched.info?.caption || '',
      creator: fetched.info?.creator || item.creator,
      captionOnly: fetched.captionOnly,
      durationSec: fetched.info?.duration,
      prior,
      signal,
    });
  }

  const { source, ...rest } = analysis;
  const result = {
    shortcode: item.shortcode,
    ...rest,
    creator: fetched.info?.creator || item.creator || '',
    caption: fetched.info?.caption || '',
    durationSec: fetched.info?.duration || null,
    captionOnly: source === 'caption',
    hasThumb: !config.demo,
    savedAt: item.savedAt || prior?.savedAt || null,
    collections: item.collections?.length ? item.collections : prior?.collections || [],
    analyzedAt: new Date().toISOString(),
    promptVersion: config.promptVersion,
  };
  await writeAnalysis(item.shortcode, result);
  const embedding = await embedFor(result, signal);
  if (embedding) await writeEmbedding(item.shortcode, { model: config.demo ? 'demo' : config.gemini.embedModel, values: embedding });
  item.step = 'done';
}

async function linkItem(job, item) {
  const existing = await readEmbedding(item.shortcode);
  if (existing) {
    item.step = 'cached';
    return;
  }
  const analysis = await readAnalysis(item.shortcode);
  if (!analysis) throw new Error('Analyze this reel first.');
  item.step = 'analyzing';
  if (!config.demo && !config.gemini.apiKey) throw new Error('Links by meaning need a Gemini key (free). Without one, reels are linked by shared tags.');
  const values = config.demo ? demoEmbedding(analysis) : await embedText(embeddingText(analysis), job.controller.signal);
  if (!values) throw new Error('No fingerprint returned.');
  await writeEmbedding(item.shortcode, { model: config.demo ? 'demo' : config.gemini.embedModel, values });
  item.step = 'done';
}

async function runJob(job) {
  for (const item of job.items) {
    if (job.controller.signal.aborted) break;
    try {
      await (job.kind === 'link' ? linkItem(job, item) : analyzeItem(job, item));
    } catch (error) {
      if (job.controller.signal.aborted) {
        item.step = 'pending';
        break;
      }
      if (error instanceof RateLimitError) {
        // Stop the batch. This reel and the rest stay "pending": not failed, no credits lost.
        item.step = 'pending';
        job.status = 'rate_limited';
        job.message = error.message;
        break;
      }
      item.step = 'failed';
      item.error = String(error?.message || error).slice(0, 400);
    } finally {
      count(job);
    }
  }

  for (const item of job.items) {
    if (item.step === 'queued' || item.step === 'fetching' || item.step === 'analyzing') item.step = 'pending';
  }
  count(job);
  if (job.status === 'running') job.status = job.controller.signal.aborted ? 'cancelled' : 'done';
  if (job.status === 'cancelled') job.message = 'Batch cancelled. Unfinished reels stay in your queue.';
  job.finishedAt = new Date().toISOString();
}
