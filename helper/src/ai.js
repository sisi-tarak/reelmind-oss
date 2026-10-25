// One place that talks to the AI providers.
//   Gemini: watches video directly, free tier, also makes embeddings.
//   Claude: bring your own key; reads text and still frames (it cannot hear audio).
// Every call is paced to stay under the provider's per-minute limit.
import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;

export class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('Cancelled'));
      },
      { once: true },
    );
  });
}

let claude = null;

// ── Gemini key pool ──────────────────────────────────────────────────────
// Calls take turns across your keys. A key that hits its limit rests (a minute, or until the daily
// reset) and the next key takes over, so a batch only stops when every key is used up.
const pool = { clients: new Map(), resting: new Map(), next: 0 };

function geminiKeys() {
  return config.gemini.apiKeys?.length ? config.gemini.apiKeys : config.gemini.apiKey ? [config.gemini.apiKey] : [];
}

/** Next midnight in California, when Gemini's daily free quota resets. */
export function nextDailyReset(now = Date.now()) {
  const pt = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offset = new Date(now).getTime() - pt.getTime();
  const midnight = new Date(pt);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() + offset + 60_000;
}

/** Picks the next key that isn't resting. Returns null when all are. */
export function pickKey(now = Date.now()) {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const index = (pool.next + i) % keys.length;
    if ((pool.resting.get(index) || 0) <= now) {
      pool.next = (index + 1) % keys.length;
      return index;
    }
  }
  return null;
}

export function restKey(index, untilMs) {
  pool.resting.set(index, untilMs);
}

export function keyStatus(now = Date.now()) {
  const keys = geminiKeys();
  return { total: keys.length, available: keys.filter((_, i) => (pool.resting.get(i) || 0) <= now).length };
}

function geminiClient(index = 0) {
  const keys = geminiKeys();
  if (!keys.length) throw new Error('No Gemini API key. Add GEMINI_API_KEY to helper/.env and restart the helper.');
  if (!pool.clients.has(index)) pool.clients.set(index, new GoogleGenAI({ apiKey: keys[index] }));
  return pool.clients.get(index);
}

/** Runs fn(client) on a free key, switching keys when one hits its limit. */
async function withGeminiKey(fn, signal) {
  const total = Math.max(1, geminiKeys().length);
  let lastLimit = null;
  for (let tries = 0; tries < total * 2 + 1; tries++) {
    const index = pickKey();
    if (index === null) {
      // Every key is resting. Wait for the soonest one if it's only a per-minute pause.
      const soonest = Math.min(...[...pool.resting.values()]);
      const wait = soonest - Date.now();
      if (lastLimit?.retryAfterMs && wait > 0 && wait <= 5 * 60_000) {
        await sleep(wait, signal);
        continue;
      }
      break;
    }
    try {
      return await fn(geminiClient(index));
    } catch (error) {
      const limit = asRateLimit(error, 'gemini');
      if (!limit) throw error;
      lastLimit = limit;
      restKey(index, limit.retryAfterMs ? Date.now() + limit.retryAfterMs : nextDailyReset());
    }
  }
  if (lastLimit && total > 1 && !lastLimit.retryAfterMs) throw new RateLimitError(`All ${total} Gemini keys reached their daily limit. The rest stays queued; click Analyze again tomorrow.`, null);
  throw lastLimit || new RateLimitError('Gemini rate limit reached. The rest stays queued; try again in a few minutes.', 60000);
}

function claudeClient() {
  if (!config.claude.apiKey) throw new Error('No Claude API key. Add ANTHROPIC_API_KEY to helper/.env and restart the helper.');
  claude ??= new Anthropic({ apiKey: config.claude.apiKey, maxRetries: 1 });
  return claude;
}

const slots = { gemini: 0, claude: 0, embed: 0 };
async function waitForSlot(provider, signal) {
  // Each Gemini key has its own per-minute allowance, so more keys means faster batches.
  const keys = Math.max(1, geminiKeys().length);
  const rpm = provider === 'claude' ? config.claude.rpm : provider === 'embed' ? config.gemini.embedRpm * keys : config.gemini.rpm * keys;
  const gap = 60000 / rpm;
  const now = Date.now();
  const wait = Math.max(0, slots[provider] - now);
  slots[provider] = Math.max(now, slots[provider]) + gap;
  if (wait > 0) await sleep(wait, signal);
}

/**
 * True when the provider's servers are temporarily overloaded or down (Gemini's 503 "high demand",
 * 500 and 504). That is Google's capacity, not your key or quota, so the key isn't rested.
 */
export function isServerBusy(error) {
  const status = Number(error?.status ?? error?.code);
  const message = String(error?.message || error);
  return [500, 502, 503, 504].includes(status) || /\b(UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED)\b|high demand|try again later|overloaded/i.test(message);
}

const BUSY_WAITS = [5_000, 15_000, 40_000];

function asRateLimit(error, provider) {
  const status = error?.status ?? error?.code;
  const message = String(error?.message || error);
  const name = provider === 'claude' ? 'Claude' : 'Gemini';
  if (status === 429 || status === 529 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) {
    const match = message.match(/retry(?:Delay)?["\s:]*"?(\d+(?:\.\d+)?)s/i);
    const daily = /per ?day|PerDay|daily/i.test(message);
    return new RateLimitError(
      daily ? `${name} daily limit reached. The rest stays queued; click Analyze again tomorrow.` : `${name} rate limit reached. The rest stays queued; try again in a few minutes.`,
      daily ? null : match ? Math.ceil(Number(match[1]) * 1000) : 60000,
    );
  }
  return null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The AI returned an empty answer.');
    return JSON.parse(match[0]);
  }
}

async function geminiVideoPart(ai, videoPath, signal) {
  const stat = await fs.stat(videoPath);
  if (stat.size <= INLINE_LIMIT_BYTES) {
    const data = await fs.readFile(videoPath, { encoding: 'base64' });
    return { part: { inlineData: { mimeType: 'video/mp4', data } }, cleanup: async () => {} };
  }
  let file = await ai.files.upload({ file: videoPath, config: { mimeType: 'video/mp4' } });
  while (file.state === 'PROCESSING') {
    await sleep(2000, signal);
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === 'FAILED') throw new Error('Gemini could not process this video file.');
  return {
    part: { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
    cleanup: async () => {
      await ai.files.delete({ name: file.name }).catch(() => {});
    },
  };
}

async function callGemini(ai, { prompt, schema, videoPath, signal, model }) {
  // A video uploaded with one key can only be read with that key, so upload and ask on the same one.
  const video = videoPath ? await geminiVideoPart(ai, videoPath, signal) : null;
  try {
    const response = await ai.models.generateContent({
      model: model || config.gemini.model,
      contents: [{ role: 'user', parts: [...(video ? [video.part] : []), { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
        temperature: 0.3,
        abortSignal: signal,
      },
    });
    return parseJson(response.text);
  } finally {
    await video?.cleanup();
  }
}

async function callClaude({ prompt, schema, images = [], signal }) {
  const response = await claudeClient().messages.create(
    {
      model: config.claude.model,
      max_tokens: 8000,
      tools: [{ name: 'save_result', description: 'Save the structured result.', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'save_result' },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    { signal },
  );
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('Claude returned an empty answer.');
  return block.input;
}

/**
 * Asks a provider for JSON matching `schema`.
 * @param {{ provider: 'gemini'|'claude', prompt: string, schema: object, videoPath?: string|null, images?: string[], signal?: AbortSignal }} req
 */
export async function aiJson(req) {
  const provider = req.provider === 'claude' ? 'claude' : 'gemini';
  let busy = 0;
  for (let attempt = 1; ; attempt++) {
    await waitForSlot(provider, req.signal);
    // After two overloaded replies in a row, try the lighter fallback model if one is set.
    const model = provider === 'gemini' && busy >= 2 && config.gemini.fallbackModel ? config.gemini.fallbackModel : undefined;
    try {
      return provider === 'claude' ? await callClaude(req) : await withGeminiKey((ai) => callGemini(ai, { ...req, model }), req.signal);
    } catch (error) {
      if (!(error instanceof RateLimitError) && isServerBusy(error)) {
        // Google's servers are busy: wait a little longer each time, then keep the reel queued instead of failing it.
        if (busy < BUSY_WAITS.length) {
          await sleep(BUSY_WAITS[busy] + Math.floor(Math.random() * 2000), req.signal);
          busy += 1;
          attempt -= 1;
          continue;
        }
        const name = provider === 'claude' ? 'Claude' : 'Gemini';
        throw new RateLimitError(`${name} is overloaded right now (the provider's servers, not your key or quota). The rest stays queued; try again in a few minutes.`, 5 * 60_000);
      }
      const limit = error instanceof RateLimitError ? error : asRateLimit(error, provider);
      // One automatic wait-and-retry for a per-minute limit; a daily limit stops the batch.
      if (limit?.retryAfterMs && attempt === 1) {
        await sleep(limit.retryAfterMs, req.signal);
        continue;
      }
      if (!limit && /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(error?.message || error))) {
        throw new Error(`Couldn't reach ${provider === 'claude' ? 'Claude' : 'Gemini'}. Check your internet connection, then try again.`);
      }
      throw limit || error;
    }
  }
}

export function modelName(provider) {
  return provider === 'claude' ? config.claude.model : config.gemini.model;
}

/**
 * Meaning fingerprints for linking related reels. Needs a Gemini key; returns null without one,
 * and the app falls back to linking by shared topic tags.
 */
export async function embedText(text, signal) {
  if (!geminiKeys().length) return null;
  await waitForSlot('embed', signal);
  return withGeminiKey(async (ai) => {
    const response = await ai.models.embedContent({
      model: config.gemini.embedModel,
      contents: `task: clustering | query: ${text.slice(0, 6000)}`,
      config: { outputDimensionality: 768, abortSignal: signal },
    });
    const values = response.embeddings?.[0]?.values;
    return Array.isArray(values) ? values.map((v) => Math.round(v * 1e5) / 1e5) : null;
  }, signal);
}
