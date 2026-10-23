// Flashcards for reels analyzed before cards existed.
// A text-only AI call on notes the app sends, cached by its exact inputs.
import { aiJson } from './ai.js';
import { cleanReels } from './boards.js';
import { config } from './config.js';
import { demoFlashcards } from './demo.js';
import { FLASHCARDS } from './prompt.js';
import { cacheKey, readCached, writeCached } from './store.js';

const CHUNK = 6;

function reelText(r) {
  return [`[${r.shortcode}] ${r.title}`, `Summary: ${r.summary}`, r.keyPoints?.length ? `Key points: ${r.keyPoints.join(' | ')}` : ''].filter(Boolean).join('\n');
}

const s = (v) => (typeof v === 'string' ? v.trim() : '');

/** @returns {Promise<Record<string, {q:string,a:string}[]>>} cards per reel */
export async function makeFlashcards({ reels: input, provider, signal }) {
  const reels = cleanReels(input, 120);
  const out = {};
  const todo = [];
  for (const r of reels) {
    const key = cacheKey({ r: { t: r.title, s: r.summary, k: r.keyPoints }, provider: config.demo ? 'demo' : provider });
    const hit = await readCached('cards', key);
    if (hit) out[r.shortcode] = hit;
    else todo.push({ r, key });
  }
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    let result = {};
    if (config.demo) {
      for (const { r } of chunk) result[r.shortcode] = demoFlashcards({ ...r, summary: r.summary || r.title });
    } else {
      const schema = {
        type: 'object',
        properties: { reels: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, cards: FLASHCARDS }, required: ['id', 'cards'] } } },
        required: ['reels'],
      };
      const prompt = [
        'Write 3-5 review flashcards for each of these saved reels. Test understanding of specific ideas, commands and steps. Answers are short. Use the ids in square brackets.',
        '',
        ...chunk.map(({ r }) => reelText(r)),
      ].join('\n\n');
      const raw = await aiJson({ provider, prompt, schema, signal });
      for (const row of Array.isArray(raw?.reels) ? raw.reels : []) {
        const cards = (Array.isArray(row?.cards) ? row.cards : []).map((c) => ({ q: s(c?.q), a: s(c?.a) })).filter((c) => c.q && c.a).slice(0, 6);
        if (cards.length) result[row.id] = cards;
      }
    }
    for (const { r, key } of chunk) {
      if (result[r.shortcode]) {
        out[r.shortcode] = result[r.shortcode];
        await writeCached('cards', key, result[r.shortcode]);
      }
    }
  }
  return out;
}
