// Topic boards (several reels on one topic merged into one learning page) and the weekly digest.
// Both are one text-only AI call each, cached by their exact inputs, so asking again is free.
import { aiJson, modelName } from './ai.js';
import { config } from './config.js';
import { cacheKey, isShortcode, readCached, writeCached } from './store.js';

const str = (description) => ({ type: 'string', description });
const ids = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const TOPIC_SCHEMA = {
  type: 'object',
  properties: {
    overview: str('What these reels teach together, in 3-5 plain sentences. Name which reel adds what.'),
    learningPath: {
      type: 'array',
      description: '3-7 steps in learning order, basics first. Each step uses one or more reels.',
      items: {
        type: 'object',
        properties: { title: str('Short step name.'), detail: str('What to learn or do in this step, one or two sentences.'), reelIds: ids('Ids of the reels for this step, exactly as given.') },
        required: ['title', 'detail', 'reelIds'],
      },
    },
    comparison: {
      type: 'object',
      description: 'Only when reels show different tools or approaches for the same job; otherwise empty arrays.',
      properties: {
        columns: { type: 'array', items: { type: 'string' }, description: '2-4 options compared.' },
        rows: {
          type: 'array',
          items: { type: 'object', properties: { aspect: str('What is compared.'), values: { type: 'array', items: { type: 'string' } } }, required: ['aspect', 'values'] },
        },
      },
      required: ['columns', 'rows'],
    },
    agreements: { type: 'array', items: { type: 'string' }, description: 'Points several reels agree on. Empty if none.' },
    contradictions: { type: 'array', items: { type: 'string' }, description: 'Where reels disagree or give conflicting advice, naming both sides. Empty if none.' },
    project: {
      type: 'object',
      description: 'One hands-on project that uses what all the reels teach, doable in 1-3 hours.',
      properties: { title: str('Project name.'), goal: str('What you will have built, one sentence.'), steps: { type: 'array', items: { type: 'string' } }, reelIds: ids('Reels the project draws on.') },
      required: ['title', 'goal', 'steps', 'reelIds'],
    },
  },
  required: ['overview', 'learningPath', 'comparison', 'agreements', 'contradictions', 'project'],
};

export const DIGEST_SCHEMA = {
  type: 'object',
  properties: {
    headline: str('One sentence on what this week of saved reels was mostly about.'),
    highlights: {
      type: 'array',
      description: '3-6 highlights grouped by theme.',
      items: { type: 'object', properties: { topic: str('Theme name, 1-4 words.'), summary: str('What you learned on it this week, 1-2 sentences.'), reelIds: ids('Reels for this theme.') }, required: ['topic', 'summary', 'reelIds'] },
    },
    quiz: {
      type: 'array',
      description: 'Multiple-choice recall questions. One correct answer each, three plausible wrong ones.',
      items: {
        type: 'object',
        properties: {
          question: str('A specific question answerable from one reel.'),
          options: { type: 'array', items: { type: 'string' }, description: 'Exactly 4 short options.' },
          answerIndex: { type: 'integer', description: 'Index (0-3) of the correct option.' },
          explanation: str('Why the answer is right, one sentence.'),
          reelId: str('Id of the reel the question comes from.'),
        },
        required: ['question', 'options', 'answerIndex', 'explanation', 'reelId'],
      },
    },
  },
  required: ['headline', 'highlights', 'quiz'],
};

function reelBlock(a) {
  return [
    `[${a.shortcode}] ${a.title} (${a.contentType}, ${a.difficulty})`,
    `Summary: ${a.summary}`,
    a.keyPoints?.length ? `Key points: ${a.keyPoints.join(' | ')}` : '',
    a.tools?.length ? `Tools: ${a.tools.map((t) => t.name).join(', ')}` : '',
    a.practiceTask?.title ? `Practice: ${a.practiceTask.title}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// The app sends the notes it already has, so boards work for any reel on the board,
// including ones analyzed on another computer or the bundled samples.
const text = (v, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = (v, n, max) => (Array.isArray(v) ? v.slice(0, n).map((x) => text(x, max)).filter(Boolean) : []);

export function cleanReels(input, limit) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(input) ? input : []) {
    if (!r || !isShortcode(r.shortcode) || seen.has(r.shortcode)) continue;
    seen.add(r.shortcode);
    out.push({
      shortcode: r.shortcode,
      title: text(r.title, 200),
      summary: text(r.summary, 1200),
      keyPoints: list(r.keyPoints, 8, 300),
      topics: list(r.topics, 4, 60),
      primaryTopic: text(r.primaryTopic, 60),
      contentType: text(r.contentType, 20),
      difficulty: text(r.difficulty, 20),
      tools: (Array.isArray(r.tools) ? r.tools : []).slice(0, 8).map((t) => ({ name: text(t?.name, 80) })).filter((t) => t.name),
      practiceTask: { title: text(r.practiceTask?.title, 200) },
      infographic: r.infographic && typeof r.infographic === 'object' ? { layout: text(r.infographic.layout, 20), columns: list(r.infographic.columns, 4, 60), rows: (Array.isArray(r.infographic.rows) ? r.infographic.rows : []).slice(0, 6).map((x) => ({ aspect: text(x?.aspect, 60), values: list(x?.values, 4, 80) })) } : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const keepIds = (list, allowed) => (Array.isArray(list) ? list.filter((id) => allowed.has(id)) : []);

function cleanTopic(raw, allowed) {
  const r = raw || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    overview: s(r.overview),
    learningPath: arr(r.learningPath).map((p) => ({ title: s(p?.title), detail: s(p?.detail), reelIds: keepIds(p?.reelIds, allowed) })).filter((p) => p.title),
    comparison: { columns: arr(r.comparison?.columns).map(s).filter(Boolean), rows: arr(r.comparison?.rows).map((x) => ({ aspect: s(x?.aspect), values: arr(x?.values).map(s) })).filter((x) => x.aspect) },
    agreements: arr(r.agreements).map(s).filter(Boolean),
    contradictions: arr(r.contradictions).map(s).filter(Boolean),
    project: { title: s(r.project?.title), goal: s(r.project?.goal), steps: arr(r.project?.steps).map(s).filter(Boolean), reelIds: keepIds(r.project?.reelIds, allowed) },
  };
}

function demoTopic(topic, reels) {
  const order = { beginner: 0, intermediate: 1, advanced: 2 };
  const sorted = [...reels].sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1));
  const comparing = reels.find((r) => r.infographic?.layout === 'comparison');
  return {
    overview: `(Demo) These ${reels.length} reels all cover ${topic}. ${sorted.map((r) => r.title).slice(0, 3).join('; ')}.`,
    learningPath: sorted.map((r) => ({ title: r.title, detail: r.summary.split('. ')[0] + '.', reelIds: [r.shortcode] })),
    comparison: comparing ? { columns: comparing.infographic.columns, rows: comparing.infographic.rows } : { columns: [], rows: [] },
    agreements: [`All ${reels.length} reels treat ${topic} as something to practise, not just watch.`],
    contradictions: [],
    project: { title: `Mini project: ${topic}`, goal: `Combine what the ${reels.length} reels show into one small build.`, steps: sorted.map((r) => r.practiceTask?.title).filter(Boolean), reelIds: sorted.map((r) => r.shortcode) },
  };
}

/** @returns {Promise<{ board: object, cached: boolean }>} */
export async function topicBoard({ topic, reels: input, provider, signal }) {
  const reels = cleanReels(input, 60).sort((a, b) => a.shortcode.localeCompare(b.shortcode));
  if (reels.length < 2) throw new Error('A topic board needs at least two analyzed reels.');
  const list = reels.map((r) => r.shortcode);
  const key = cacheKey({ topic, reels, provider: config.demo ? 'demo' : provider, v: config.promptVersion });
  const hit = await readCached('topics', key);
  if (hit) return { board: hit, cached: true };
  const allowed = new Set(reels.map((r) => r.shortcode));
  let board;
  if (config.demo) {
    board = demoTopic(topic, reels);
  } else {
    const prompt = [
      `These ${reels.length} saved reels are all about "${topic}". Merge them into one study page.`,
      'Refer to reels only by the ids in square brackets. Write in clear, simple English. Do not invent facts beyond the reels, except to make the project runnable.',
      '',
      ...reels.map(reelBlock),
    ].join('\n\n');
    board = cleanTopic(await aiJson({ provider, prompt, schema: TOPIC_SCHEMA, signal }), allowed);
  }
  const result = { topic, reelIds: list, ...board, model: config.demo ? 'demo' : modelName(provider), provider: config.demo ? 'demo' : provider, createdAt: new Date().toISOString() };
  await writeCached('topics', key, result);
  return { board: result, cached: false };
}

function cleanDigest(raw, allowed) {
  const r = raw || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    headline: s(r.headline),
    highlights: arr(r.highlights).map((h) => ({ topic: s(h?.topic), summary: s(h?.summary), reelIds: keepIds(h?.reelIds, allowed) })).filter((h) => h.topic),
    quiz: arr(r.quiz)
      .map((q) => ({ question: s(q?.question), options: arr(q?.options).map(s).slice(0, 4), answerIndex: Number(q?.answerIndex), explanation: s(q?.explanation), reelId: allowed.has(q?.reelId) ? q.reelId : '' }))
      .filter((q) => q.question && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4),
  };
}

const hashOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function demoDigest(week, review) {
  const all = [...week, ...review];
  const byTopic = new Map();
  for (const r of week) {
    if (!byTopic.has(r.primaryTopic)) byTopic.set(r.primaryTopic, []);
    byTopic.get(r.primaryTopic).push(r);
  }
  const quiz = [];
  for (const r of all) {
    const right = r.keyPoints?.[0];
    if (!right) continue;
    const wrong = all.filter((o) => o.primaryTopic !== r.primaryTopic && o.keyPoints?.[0]).map((o) => o.keyPoints[0]);
    const unique = [...new Set(wrong)].slice(0, 3);
    if (unique.length < 3) continue;
    const pos = hashOf(r.shortcode) % 4;
    const options = [...unique];
    options.splice(pos, 0, right);
    quiz.push({ question: `Which of these is a key point from "${r.title}"?`, options, answerIndex: pos, explanation: `It's the first key point of that reel.`, reelId: r.shortcode });
    if (quiz.length >= 8) break;
  }
  return {
    headline: `(Demo) This week you saved ${week.length} reels across ${byTopic.size} topics.`,
    highlights: [...byTopic.entries()].map(([topic, list]) => ({ topic, summary: list.map((x) => x.title).join('; '), reelIds: list.map((x) => x.shortcode) })),
    quiz,
  };
}

export async function weeklyDigest({ weekStart, reels: weekInput, review: reviewInput, provider, signal }) {
  const weekReels = cleanReels(weekInput, 120).sort((a, b) => a.shortcode.localeCompare(b.shortcode));
  if (!weekReels.length) throw new Error('No analyzed reels were saved in this week.');
  const week = weekReels.map((r) => r.shortcode);
  const reviewReels = cleanReels(reviewInput, 10).filter((r) => !week.includes(r.shortcode));
  const review = reviewReels.map((r) => r.shortcode);
  const key = cacheKey({ weekStart, weekReels, reviewReels, provider: config.demo ? 'demo' : provider, v: config.promptVersion });
  const hit = await readCached('digests', key);
  if (hit) return { digest: hit, cached: true };
  const allowed = new Set([...weekReels, ...reviewReels].map((r) => r.shortcode));
  let digest;
  if (config.demo) {
    digest = demoDigest(weekReels, reviewReels);
  } else {
    const prompt = [
      `Write a weekly recap and a recall quiz for someone who saved these ${weekReels.length} reels this week.`,
      `Make ${Math.min(8, Math.max(4, weekReels.length))} questions from this week's reels${reviewReels.length ? ` and ${Math.min(3, reviewReels.length)} from the older reels to review` : ''}.`,
      'Questions must test understanding of a specific fact, command or idea, not trivia like the creator name. Refer to reels only by the ids in square brackets.',
      '',
      "THIS WEEK'S REELS",
      ...weekReels.map(reelBlock),
      ...(reviewReels.length ? ['', 'OLDER REELS TO REVIEW', ...reviewReels.map(reelBlock)] : []),
    ].join('\n\n');
    digest = cleanDigest(await aiJson({ provider, prompt, schema: DIGEST_SCHEMA, signal }), allowed);
  }
  const result = { weekStart, reelIds: week, reviewIds: review, ...digest, model: config.demo ? 'demo' : modelName(provider), provider: config.demo ? 'demo' : provider, createdAt: new Date().toISOString() };
  await writeCached('digests', key, result);
  return { digest: result, cached: false };
}

/** Demo-mode stand-in for embeddings: reels sharing tags and tools come out similar. */
export function demoEmbedding(a) {
  const v = new Array(64).fill(0);
  for (const t of [...(a.topics || []), ...(a.tools || []).map((x) => `tool:${x.name.toLowerCase()}`), a.primaryTopic]) {
    v[hashOf(t) % 64] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => Math.round((x / n) * 1e5) / 1e5);
}
