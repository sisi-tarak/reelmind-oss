import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, providerReady } from './config.js';
import { topicBoard, weeklyDigest } from './boards.js';
import { cancelJob, getCurrentJob, getJob, isBusy, serializeJob, startJob } from './jobs.js';
import { connectToken, isShortcode, listAnalyzed, readAnalysis, readEmbedding, readInbox, thumbPath, updateInbox } from './store.js';
import { extractAssets, rewriteAsset } from './assets.js';
import { keyStatus } from './ai.js';
import { phoneLink, remoteState } from './tunnel.js';
import { makeFlashcards } from './flashcards.js';
import { detectTools } from './tools.js';

export const VERSION = '1.0.0';

const REEL_URL = /(?:instagram\.com|instagr\.am)\/(?:[A-Za-z0-9_.]{1,30}\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,64})/i;

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function sameCode(given, expected) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function createServer() {
  const app = express();
  const code = connectToken();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Who may use the helper:
  //   - pages served from this computer (localhost), as before;
  //   - the hosted app, but only with the connect code printed in the helper window.
  // Any other website gets nothing, so it can't spend your AI credits or read your notes.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ReelMind-Code');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    const given = req.get('X-ReelMind-Code') || (typeof req.query.code === 'string' ? req.query.code : '');
    // Requests that arrive through a phone tunnel (Host is not this computer) always need the code,
    // even without an Origin header, so nobody on the internet can use the helper.
    const h = req.headers;
    const local = LOCAL_HOST.test(h.host || '') && !h['cf-connecting-ip'] && !h['x-forwarded-for'] && !h['x-forwarded-proto'] && !h['tailscale-user-login'];
    req.trusted = (local && (!origin || LOCAL_ORIGIN.test(origin))) || sameCode(given, code);
    next();
  });

  app.get('/api/health', async (req, res) => {
    if (!req.trusted) return res.json({ ok: true, version: VERSION, needsCode: true });
    const tools = await detectTools({ refresh: !isBusy() });
    res.json({
      ok: true,
      version: VERSION,
      needsCode: false,
      demo: config.demo,
      tools,
      gemini: { configured: Boolean(config.gemini.apiKey), model: config.gemini.model, rpm: config.gemini.rpm, keys: config.gemini.apiKeys.length, keysAvailable: keyStatus().available },
      claude: { configured: Boolean(config.claude.apiKey), model: config.claude.model },
      defaultProvider: config.defaultProvider,
      embeddings: config.demo || Boolean(config.gemini.apiKey),
      cookies: Boolean(config.ytdlp.cookiesBrowser || config.ytdlp.cookiesFile),
      remote: { ...remoteState(), link: phoneLink(code) },
      busy: isBusy(),
      currentJobId: getCurrentJob()?.id || null,
    });
  });

  const providerFrom = (p) => (p === 'claude' ? 'claude' : p === 'gemini' ? 'gemini' : config.defaultProvider);

  app.use('/api', (req, res, next) => {
    if (req.trusted) return next();
    res.status(401).json({ error: 'Enter the connect code shown in the helper window to use it from this site.', needsCode: true });
  });

  app.post('/api/jobs', (req, res) => {
    try {
      const { reels, provider, force, kind } = req.body || {};
      const job = startJob(reels, { provider, force: force === true, kind });
      res.status(202).json(serializeJob(job));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  app.get('/api/jobs/current', (_req, res) => res.json(serializeJob(getCurrentJob())));

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Batch not found. The helper may have restarted.' });
    res.json(serializeJob(job));
  });

  app.post('/api/jobs/:id/cancel', (req, res) => {
    const job = cancelJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Batch not found.' });
    res.json(serializeJob(job));
  });

  // Saved analyses and fingerprints from the disk cache. Never calls the AI.
  app.post('/api/analyses', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isShortcode).slice(0, 500) : [];
    const out = {};
    for (const id of ids) {
      const analysis = await readAnalysis(id);
      if (!analysis) continue;
      const embedding = await readEmbedding(id);
      out[id] = { ...analysis, embedding: embedding?.values || null };
    }
    res.json(out);
  });

  // Every reel this helper has notes for, so any browser can show them without analyzing again.
  app.get('/api/library', async (_req, res) => {
    res.json(await listAnalyzed());
  });

  // Reels sent from the browser extension wait here until the app picks them up.
  app.post('/api/inbox', async (req, res) => {
    const urls = [req.body?.url, ...(Array.isArray(req.body?.urls) ? req.body.urls : [])].filter((u) => typeof u === 'string');
    const found = [...new Set(urls.map((u) => u.match(REEL_URL)?.[1]).filter(Boolean))];
    if (!found.length) return res.status(400).json({ error: 'That is not an Instagram reel or post link.' });
    const now = new Date().toISOString();
    const creator = typeof req.body?.creator === 'string' ? req.body.creator.slice(0, 100) : '';
    await updateInbox((inbox) => {
      const known = new Set(inbox.map((i) => i.shortcode));
      for (const shortcode of found) if (!known.has(shortcode)) inbox.push({ shortcode, creator, addedAt: now });
      return inbox.slice(-500);
    });
    let analyzing = false;
    let message = found.length === 1 ? 'Sent to ReelMind.' : `Sent ${found.length} reels to ReelMind.`;
    if (req.body?.analyze === true) {
      const fresh = [];
      for (const shortcode of found) if (!(await readAnalysis(shortcode))) fresh.push({ shortcode, creator, savedAt: now });
      if (!fresh.length) message = 'Already analyzed. It is on your board.';
      else if (isBusy()) message = 'Sent. A batch is running, so analyze it from the queue when it finishes.';
      else if (!providerReady(config.defaultProvider)) message = 'Sent. Add an AI key to the helper to analyze it.';
      else {
        startJob(fresh, { provider: config.defaultProvider });
        analyzing = true;
        message = 'Sent and analyzing now.';
      }
    }
    res.json({ added: found, analyzing, message });
  });

  app.get('/api/inbox', async (_req, res) => res.json(await readInbox()));

  app.post('/api/inbox/ack', async (req, res) => {
    const done = new Set(Array.isArray(req.body?.ids) ? req.body.ids : []);
    await updateInbox((inbox) => inbox.filter((i) => !done.has(i.shortcode)));
    res.json({ ok: true });
  });

  app.post('/api/flashcards', async (req, res) => {
    const provider = providerFrom(req.body?.provider);
    if (!providerReady(provider)) return res.status(400).json({ error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} key set in helper/.env.` });
    try {
      res.json(await makeFlashcards({ reels: req.body?.reels, provider }));
    } catch (error) {
      res.status(error.name === 'RateLimitError' ? 429 : 500).json({ error: error.message });
    }
  });

  app.post('/api/extract', async (req, res) => {
    const provider = providerFrom(req.body?.provider);
    if (!providerReady(provider)) return res.status(400).json({ error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} key set in helper/.env.` });
    try {
      res.json(await extractAssets({ reels: req.body?.reels, provider }));
    } catch (error) {
      res.status(error.name === 'RateLimitError' ? 429 : 500).json({ error: error.message });
    }
  });

  app.post('/api/rewrite', async (req, res) => {
    const provider = providerFrom(req.body?.provider);
    if (!providerReady(provider)) return res.status(400).json({ error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} key set in helper/.env.` });
    try {
      const { kind, content, instruction } = req.body || {};
      res.json(await rewriteAsset({ kind, content, instruction, provider }));
    } catch (error) {
      res.status(error.status || (error.name === 'RateLimitError' ? 429 : 500)).json({ error: error.message });
    }
  });

  app.post('/api/embeddings', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isShortcode).slice(0, 2000) : [];
    const out = {};
    for (const id of ids) {
      const e = await readEmbedding(id);
      if (e) out[id] = e.values;
    }
    res.json(out);
  });

  app.post('/api/topic-board', async (req, res) => {
    const { topic, reels } = req.body || {};
    const provider = providerFrom(req.body?.provider);
    if (typeof topic !== 'string' || !Array.isArray(reels)) return res.status(400).json({ error: 'Send a topic and its reels.' });
    if (!providerReady(provider)) return res.status(400).json({ error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} key set in helper/.env.` });
    try {
      res.json(await topicBoard({ topic: topic.slice(0, 120), reels, provider }));
    } catch (error) {
      res.status(error.name === 'RateLimitError' ? 429 : /needs at least|No analyzed reels/.test(error.message) ? 400 : 500).json({ error: error.message });
    }
  });

  app.post('/api/digest', async (req, res) => {
    const { weekStart, reels, review } = req.body || {};
    const provider = providerFrom(req.body?.provider);
    if (typeof weekStart !== 'string' || !Array.isArray(reels)) return res.status(400).json({ error: 'Send the week and its reels.' });
    if (!providerReady(provider)) return res.status(400).json({ error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} key set in helper/.env.` });
    try {
      res.json(
        await weeklyDigest({ weekStart: weekStart.slice(0, 10), reels, review: Array.isArray(review) ? review : [], provider }),
      );
    } catch (error) {
      res.status(error.name === 'RateLimitError' ? 429 : /needs at least|No analyzed reels/.test(error.message) ? 400 : 500).json({ error: error.message });
    }
  });

  app.get('/api/thumbs/:id', (req, res) => {
    if (!isShortcode(req.params.id)) return res.sendStatus(400);
    const file = thumbPath(req.params.id);
    if (!file) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'max-age=86400');
    res.sendFile(file);
  });

  if (config.serveWeb && existsSync(config.webDist)) {
    app.use(express.static(config.webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  return { app, code };
}
