import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reelmind-test-'));
process.env.REELMIND_DATA_DIR = tmp;
process.env.REELMIND_DEMO = '1';

const { startJob, getJob } = await import('../src/jobs.js');
const { readAnalysis, readEmbedding } = await import('../src/store.js');
const { explainYtdlpError } = await import('../src/fetcher.js');
const { normalizeAnalysis } = await import('../src/prompt.js');
const { topicBoard, weeklyDigest } = await import('../src/boards.js');
const { createServer } = await import('../src/server.js');

async function waitFor(job) {
  for (let i = 0; i < 300; i++) {
    const j = getJob(job.id);
    if (j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
}

test('analyzes new reels, then serves them from cache with no new work', async () => {
  const first = await waitFor(startJob([{ shortcode: 'ABCdef123' }, { shortcode: 'XYZ_9-876' }, { shortcode: 'ABCdef123' }]));
  assert.equal(first.status, 'done');
  assert.equal(first.items.length, 2, 'duplicates inside one batch are collapsed');
  assert.deepEqual(first.items.map((i) => i.step), ['done', 'done']);
  assert.ok(await readAnalysis('ABCdef123'));
  assert.ok(await readEmbedding('ABCdef123'), 'a fingerprint is saved with the analysis');

  const second = await waitFor(startJob([{ shortcode: 'ABCdef123' }, { shortcode: 'NEWone456' }]));
  assert.deepEqual(second.items.map((i) => i.step), ['cached', 'done']);
});

test('re-analyze runs again only when forced', async () => {
  const before = (await readAnalysis('ABCdef123')).analyzedAt;
  const job = await waitFor(startJob([{ shortcode: 'ABCdef123' }], { force: true }));
  assert.deepEqual(job.items.map((i) => i.step), ['done']);
  assert.notEqual((await readAnalysis('ABCdef123')).analyzedAt, before);
});

test('link jobs reuse existing fingerprints', async () => {
  const job = await waitFor(startJob([{ shortcode: 'ABCdef123' }], { kind: 'link' }));
  assert.deepEqual(job.items.map((i) => i.step), ['cached']);
});

test('topic boards and digests are cached by their inputs', async () => {
  const notes = await Promise.all(['ABCdef123', 'XYZ_9-876', 'NEWone456'].map(readAnalysis));
  const a = await topicBoard({ topic: 'demo', reels: notes.slice(0, 2), provider: 'gemini' });
  assert.equal(a.cached, false);
  assert.ok(a.board.learningPath.length >= 2);
  const b = await topicBoard({ topic: 'demo', reels: [notes[1], notes[0]], provider: 'gemini' });
  assert.equal(b.cached, true, 'order does not matter');
  const d = await weeklyDigest({ weekStart: '2026-10-19', reels: notes, review: [], provider: 'gemini' });
  assert.ok(d.digest.highlights.length >= 1);
});

test('rejects invalid ids', () => {
  assert.throws(() => startJob([{ shortcode: '../../etc' }]), /No valid reels/);
});

test('other websites need the connect code', async () => {
  const { app, code } = createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const blocked = await fetch(`${base}/api/jobs/current`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(blocked.status, 401);
    const health = await (await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } })).json();
    assert.equal(health.needsCode, true);
    assert.equal(health.gemini, undefined, 'no details leak without the code');
    const allowed = await fetch(`${base}/api/jobs/current`, { headers: { Origin: 'https://reelmind-tau.vercel.app', 'X-ReelMind-Code': code } });
    assert.equal(allowed.status, 200);
    const local = await fetch(`${base}/api/jobs/current`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(local.status, 200);
  } finally {
    server.close();
  }
});

test('explains common yt-dlp errors in plain words', () => {
  assert.match(explainYtdlpError('ERROR: [Instagram] abc: login required'), /YTDLP_COOKIES_BROWSER/);
  assert.match(explainYtdlpError('ERROR: [Instagram] abc: This content is not available'), /private, deleted/);
});

test('normalizeAnalysis fills missing fields', () => {
  const a = normalizeAnalysis({ title: 'x' });
  assert.equal(a.primaryTopic, 'unsorted');
  assert.equal(a.infographic.layout, 'checklist');
  assert.deepEqual(a.tools, []);
});

test('library, inbox and flashcards', async () => {
  const { app, code } = createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ext = { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdef', 'X-ReelMind-Code': code };
  try {
    const lib = await (await fetch(`${base}/api/library`)).json();
    assert.ok(lib.some((r) => r.shortcode === 'ABCdef123'), 'library lists analyzed reels');

    const noCode = await fetch(`${base}/api/inbox`, { method: 'POST', headers: { ...ext, 'X-ReelMind-Code': 'wrong' }, body: JSON.stringify({ url: 'https://www.instagram.com/reel/INBOXaa111/' }) });
    assert.equal(noCode.status, 401, 'the extension needs the connect code');
    const sent = await (await fetch(`${base}/api/inbox`, { method: 'POST', headers: ext, body: JSON.stringify({ url: 'https://www.instagram.com/reel/INBOXaa111/?igsh=x' }) })).json();
    assert.deepEqual(sent.added, ['INBOXaa111']);
    const inbox = await (await fetch(`${base}/api/inbox`)).json();
    assert.equal(inbox.length, 1);
    await fetch(`${base}/api/inbox/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['INBOXaa111'] }) });
    assert.equal((await (await fetch(`${base}/api/inbox`)).json()).length, 0);

    const notes = await readAnalysis('ABCdef123');
    const cards = await (await fetch(`${base}/api/flashcards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reels: [notes] }) })).json();
    assert.ok(cards.ABCdef123.length >= 2);
  } finally {
    server.close();
  }
});

test('skill names follow the Agent Skills rules', async () => {
  const { skillName, normalizeAssets } = await import('../src/prompt.js');
  assert.equal(skillName('Claude Commit Writer!'), 'commit-writer');
  assert.equal(skillName(''), 'my-skill');
  assert.equal(skillName('x'.repeat(80)).length, 64);
  const a = normalizeAssets({ skills: [{ name: 'A B', description: 'd', instructions: '' }], prompts: [{ prompt: 'p' }], snippets: [{ code: 'ls' }] });
  assert.equal(a.skills.length, 0, 'a skill without instructions is dropped');
  assert.equal(a.prompts[0].title, 'Prompt');
  assert.equal(a.snippets[0].language, 'text');
});

test('older reels get their reusable parts, and rewrites work', async () => {
  const { app } = createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = { 'Content-Type': 'application/json' };
  try {
    const notes = await readAnalysis('ABCdef123');
    const { assets: _gone, ...older } = notes;
    const out = await (await fetch(`${base}/api/extract`, { method: 'POST', headers: json, body: JSON.stringify({ reels: [{ ...older, shortcode: 'ABCdef123' }] }) })).json();
    assert.ok(out.ABCdef123 && Array.isArray(out.ABCdef123.snippets));
    const re = await (await fetch(`${base}/api/rewrite`, { method: 'POST', headers: json, body: JSON.stringify({ kind: 'prompt', content: 'Summarise this', instruction: 'make it shorter' }) })).json();
    assert.match(re.content, /Summarise this/);
    const bad = await fetch(`${base}/api/rewrite`, { method: 'POST', headers: json, body: JSON.stringify({ kind: 'prompt', content: '', instruction: '' }) });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test('requests through a phone tunnel need the connect code', async () => {
  const { app, code } = createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const tunneled = await fetch(`${base}/api/library`, { headers: { 'X-Forwarded-For': '203.0.113.9', 'Cf-Connecting-Ip': '203.0.113.9' } });
    assert.equal(tunneled.status, 401, 'no code, no access, even without an Origin header');
    const ok = await fetch(`${base}/api/library`, { headers: { 'X-Forwarded-For': '203.0.113.9', 'X-ReelMind-Code': code } });
    assert.equal(ok.status, 200);
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.remote.status, 'off');
  } finally {
    server.close();
  }
});

test('Gemini keys take turns and a tired key rests', async () => {
  const { config } = await import('../src/config.js');
  const ai = await import('../src/ai.js');
  const saved = config.gemini.apiKeys;
  config.gemini.apiKeys = ['k1', 'k2', 'k3'];
  try {
    const now = Date.now();
    const first = ai.pickKey(now);
    const second = ai.pickKey(now);
    assert.notEqual(first, second, 'round robin');
    ai.restKey(0, now + 60_000);
    ai.restKey(1, now + 60_000);
    assert.equal(ai.pickKey(now), 2);
    assert.equal(ai.pickKey(now), 2, 'only the rested-out keys are skipped');
    ai.restKey(2, now + 60_000);
    assert.equal(ai.pickKey(now), null, 'all keys resting');
    assert.equal(ai.keyStatus(now).available, 0);
    assert.ok(ai.pickKey(now + 61_000) !== null, 'keys come back after their rest');
    const reset = ai.nextDailyReset(now);
    assert.ok(reset > now && reset - now <= 25 * 3600_000);
  } finally {
    config.gemini.apiKeys = saved;
    for (const i of [0, 1, 2]) ai.restKey(i, 0);
  }
});

test('many inbox saves at the same moment never fail or lose reels', async () => {
  const { app, code } = createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-ReelMind-Code': code };
  try {
    const ids = Array.from({ length: 25 }, (_, i) => `RACEx${String(i).padStart(4, '0')}`);
    const sends = ids.map((id) => fetch(`${base}/api/inbox`, { method: 'POST', headers, body: JSON.stringify({ url: `https://www.instagram.com/reel/${id}/` }) }));
    const acks = Array.from({ length: 10 }, () => fetch(`${base}/api/inbox/ack`, { method: 'POST', headers, body: JSON.stringify({ ids: ['NOTHERE00'] }) }));
    const results = await Promise.all([...sends, ...acks]);
    assert.ok(results.every((r) => r.ok), 'every request succeeded');
    const inbox = await (await fetch(`${base}/api/inbox`, { headers })).json();
    for (const id of ids) assert.ok(inbox.some((i) => i.shortcode === id), `${id} kept`);
    await fetch(`${base}/api/inbox/ack`, { method: 'POST', headers, body: JSON.stringify({ ids }) });
  } finally {
    server.close();
  }
});
test('an overloaded provider is told apart from a used-up quota', async () => {
  const { isServerBusy } = await import('../src/ai.js');
  assert.equal(isServerBusy({ message: '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}' }), true);
  assert.equal(isServerBusy({ status: 503, message: 'Service Unavailable' }), true);
  assert.equal(isServerBusy({ status: 429, message: 'RESOURCE_EXHAUSTED: quota exceeded' }), false);
  assert.equal(isServerBusy({ status: 400, message: 'Invalid argument' }), false);
});
