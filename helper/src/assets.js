// Skills, prompts, code and workflows from reels analyzed before the analysis captured them,
// and AI rewrites of any of them. Text-only calls on notes; results are cached by their inputs.
import { aiJson, modelName } from './ai.js';
import { config } from './config.js';
import { demoAssets } from './demo.js';
import { ASSETS, normalizeAssets } from './prompt.js';
import { cacheKey, isShortcode, readAnalysis, readCached, writeAnalysis, writeCached } from './store.js';

const CHUNK = 3;
const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function clean(input) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(input) ? input : []) {
    if (!r || !isShortcode(r.shortcode) || seen.has(r.shortcode)) continue;
    seen.add(r.shortcode);
    out.push({
      shortcode: r.shortcode,
      title: s(r.title, 200),
      summary: s(r.summary, 1500),
      keyPoints: (Array.isArray(r.keyPoints) ? r.keyPoints : []).slice(0, 8).map((p) => s(p, 300)),
      topics: (Array.isArray(r.topics) ? r.topics : []).slice(0, 4).map((t) => s(t, 60)),
      tools: (Array.isArray(r.tools) ? r.tools : []).slice(0, 10).map((t) => ({ name: s(t?.name, 80) })),
      practiceTask: { title: s(r.practiceTask?.title, 200), language: s(r.practiceTask?.language, 20), code: s(r.practiceTask?.code, 4000) },
      infographic: { items: (Array.isArray(r.infographic?.items) ? r.infographic.items : []).slice(0, 6).map((i) => ({ label: s(i?.label, 60), detail: s(i?.detail, 120) })) },
      caption: s(r.caption, 2000),
      transcript: s(r.transcript, 8000),
      onScreenText: s(r.onScreenText, 4000),
    });
    if (out.length >= 60) break;
  }
  return out;
}

function reelText(r) {
  return [
    `[${r.shortcode}] ${r.title}`,
    `Summary: ${r.summary}`,
    r.keyPoints.length ? `Key points: ${r.keyPoints.join(' | ')}` : '',
    r.tools.length ? `Tools: ${r.tools.map((t) => t.name).join(', ')}` : '',
    r.caption ? `Caption: ${r.caption}` : '',
    r.transcript ? `Transcript: ${r.transcript}` : '',
    r.onScreenText ? `Text on screen: ${r.onScreenText}` : '',
    r.practiceTask.code ? `Code from the notes (${r.practiceTask.language}):\n${r.practiceTask.code}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** @returns {Promise<Record<string, ReturnType<typeof normalizeAssets>>>} */
export async function extractAssets({ reels: input, provider, signal }) {
  const reels = clean(input);
  const out = {};
  const todo = [];
  for (const r of reels) {
    // The helper's own copy has the full transcript; prefer it.
    const saved = await readAnalysis(r.shortcode);
    if (saved?.assets) {
      out[r.shortcode] = saved.assets;
      continue;
    }
    const full = saved ? { ...r, transcript: s(saved.transcript, 8000) || r.transcript, onScreenText: s(saved.onScreenText, 4000) || r.onScreenText, caption: s(saved.caption, 2000) || r.caption } : r;
    const key = cacheKey({ r: full, provider: config.demo ? 'demo' : provider, v: config.promptVersion });
    const hit = await readCached('assets', key);
    if (hit) out[r.shortcode] = hit;
    else todo.push({ r: full, key, saved });
  }
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const result = {};
    if (config.demo) {
      for (const { r } of chunk) result[r.shortcode] = demoAssets(r);
    } else {
      const schema = {
        type: 'object',
        properties: { reels: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, assets: ASSETS }, required: ['id', 'assets'] } } },
        required: ['reels'],
      };
      const prompt = [
        'These are notes and transcripts of reels someone saved. For each reel, list what they can reuse directly: prompts and code exactly as shown (complete them where they are cut off), workflows step by step, and a complete SKILL.md only when the reel is about a Claude or agent skill.',
        'Never invent prompts, code or skills the reel does not show or clearly describe; leave the list empty instead. Write in clear English. Use the ids in square brackets.',
        '',
        ...chunk.map(({ r }) => reelText(r)),
      ].join('\n\n');
      const raw = await aiJson({ provider, prompt, schema, signal });
      for (const row of Array.isArray(raw?.reels) ? raw.reels : []) if (row?.id) result[row.id] = normalizeAssets(row.assets);
    }
    for (const { r, key, saved } of chunk) {
      const assets = result[r.shortcode] || normalizeAssets({});
      out[r.shortcode] = assets;
      await writeCached('assets', key, assets);
      // Keep it with the reel, so other browsers and devices get it without another AI call.
      if (saved) await writeAnalysis(r.shortcode, { ...saved, assets });
    }
  }
  return out;
}

const KINDS = {
  skill: 'a Claude skill file (SKILL.md with YAML front matter: name and description, then Markdown instructions). Keep the front matter; the name stays lowercase with hyphens',
  prompt: 'a prompt to paste into an AI chat',
  snippet: 'a code snippet',
  workflow: 'a step-by-step automation workflow in Markdown',
};

export async function rewriteAsset({ kind, content, instruction, provider, signal }) {
  const k = KINDS[kind] ? kind : 'prompt';
  const text = s(content, 30000);
  const ask = s(instruction, 1000);
  if (!text || !ask) throw Object.assign(new Error('Add an instruction and some content to rewrite.'), { status: 400 });
  const key = cacheKey({ k, text, ask, provider: config.demo ? 'demo' : provider });
  const hit = await readCached('rewrites', key);
  if (hit) return { ...hit, cached: true };
  let result;
  if (config.demo) {
    result = { content: `${text}\n\n<!-- (Demo) Rewritten for: ${ask} -->`, model: 'demo' };
  } else {
    const raw = await aiJson({
      provider,
      signal,
      schema: { type: 'object', properties: { content: { type: 'string', description: 'The full rewritten content, ready to use.' } }, required: ['content'] },
      prompt: [`Rewrite ${KINDS[k]}.`, `Instruction: ${ask}`, 'Keep what still applies, change what the instruction asks, keep the same format, and return the complete new version only.', '', 'CURRENT VERSION:', text].join('\n'),
    });
    const next = s(raw?.content, 60000);
    if (!next) throw new Error('The AI returned nothing. Try again.');
    result = { content: next, model: modelName(provider) };
  }
  await writeCached('rewrites', key, result);
  return { ...result, cached: false };
}
