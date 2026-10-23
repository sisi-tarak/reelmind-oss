// Daily review: short flashcards from your reels, scheduled so you see each idea again just before you'd forget it.
// The schedule is a small SM-2 variant. Everything stays in this browser.
import { db } from './db';
import type { Analysis, Card, ReviewLog } from './types';

export type Grade = 0 | 1 | 2 | 3;
export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 0, label: 'Again', key: '1' },
  { grade: 1, label: 'Hard', key: '2' },
  { grade: 2, label: 'Good', key: '3' },
  { grade: 3, label: 'Easy', key: '4' },
];

const DAY = 86_400_000;
const AGAIN_MS = 10 * 60_000;
const START_EASE = 2.5;
const MIN_EASE = 1.3;

// ── Building cards ─────────────────────────────────────────────────────────

const STOP = new Set(
  'about above after again against because before being below between could doing during every first from have having into itself might more most other ought over same should some such than that their theirs them then there these they this those through under until very what when where which while whom with would your yours using used make makes made just also only will like want need'.split(' '),
);

function firstSentence(text: string) {
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}

/** Hides the most telling word in a sentence: a tool name, a number, or the longest uncommon word. */
export function cloze(sentence: string): { front: string; answer: string } | null {
  const words = sentence.match(/[A-Za-z][A-Za-z0-9.+#-]*[A-Za-z0-9+#]|\d+(?:[.,]\d+)?%?/g) || [];
  const candidates = words.filter((w) => !STOP.has(w.toLowerCase()) && (w.length >= 5 || /\d/.test(w) || /[A-Z].*[A-Z]|\.|[+#]/.test(w)));
  if (!candidates.length) return null;
  const score = (w: string) => (/[A-Z]/.test(w.slice(1)) || /[.+#]/.test(w) ? 30 : 0) + (/\d/.test(w) ? 20 : 0) + (/^[A-Z]/.test(w) ? 8 : 0) + w.length;
  const answer = candidates.reduce((best, w) => (score(w) > score(best) ? w : best));
  const at = sentence.indexOf(answer);
  return { front: `${sentence.slice(0, at)}_____${sentence.slice(at + answer.length)}`, answer };
}

/** Cards written from the notes when the AI didn't write any (reels analyzed before cards existed). */
export function autoCards(a: Analysis): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = [];
  if (a.summary) out.push({ front: `What's the main idea of “${a.title}”?`, back: firstSentence(a.summary) });
  for (const point of a.keyPoints.slice(0, 4)) {
    if (out.length >= 3) break;
    const c = cloze(point);
    if (c) out.push({ front: `Fill the gap: ${c.front}`, back: `${c.answer}. ${point}` });
  }
  if (a.practiceTask?.title && out.length < 4) out.push({ front: `What did “${a.title}” suggest you try?`, back: a.practiceTask.title });
  return out;
}

function newCard(shortcode: string, source: Card['source'], i: number, front: string, back: string, now: string): Card {
  return { id: `${shortcode}:${source}:${i}`, shortcode, front, back, source, due: now, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
}

/**
 * Makes sure every analyzed reel has cards. AI cards replace auto cards you haven't answered yet;
 * cards you've already studied are never thrown away. Returns how many cards were added.
 */
export async function ensureCards(analyses: Analysis[]): Promise<number> {
  if (!analyses.length) return 0;
  const now = new Date().toISOString();
  return db.transaction('rw', db.cards, async () => {
    const existing = await db.cards.where('shortcode').anyOf(analyses.map((a) => a.shortcode)).toArray();
    const byReel = new Map<string, Card[]>();
    for (const c of existing) byReel.set(c.shortcode, [...(byReel.get(c.shortcode) || []), c]);
    const add: Card[] = [];
    const drop: string[] = [];
    for (const a of analyses) {
      const have = byReel.get(a.shortcode) || [];
      const ai = (a.flashcards || []).filter((c) => c.q && c.a);
      if (ai.length && !have.some((c) => c.source === 'ai')) {
        drop.push(...have.filter((c) => c.source === 'auto' && !c.lastReviewed).map((c) => c.id));
        ai.forEach((c, i) => add.push(newCard(a.shortcode, 'ai', i, c.q, c.a, now)));
      } else if (!have.length) {
        autoCards(a).forEach((c, i) => add.push(newCard(a.shortcode, 'auto', i, c.front, c.back, now)));
      }
    }
    if (drop.length) await db.cards.bulkDelete(drop);
    if (add.length) await db.cards.bulkPut(add);
    return add.length;
  });
}

// ── Scheduling ─────────────────────────────────────────────────────────────

export const isNew = (c: Card) => !c.lastReviewed;

/** The card after answering it. `now` is a timestamp in ms. */
export function schedule(card: Card, grade: Grade, now = Date.now()): Card {
  let { interval, ease, reps, lapses } = card;
  if (grade === 0) {
    lapses += card.reps > 0 ? 1 : 0;
    reps = 0;
    interval = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    if (grade === 1) {
      interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      ease = Math.max(MIN_EASE, ease - 0.15);
    } else if (grade === 2) {
      interval = reps === 0 ? 1 : reps === 1 ? Math.max(3, interval + 1) : Math.max(interval + 1, Math.round(interval * ease));
    } else {
      interval = reps === 0 ? 4 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
      ease += 0.15;
    }
    interval = Math.min(interval, 365);
    reps += 1;
  }
  const due = grade === 0 ? now + AGAIN_MS : startOfDay(now) + interval * DAY + 3 * 3_600_000;
  return { ...card, interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: new Date(due).toISOString(), lastReviewed: new Date(now).toISOString() };
}

/** "10m", "1d", "3w", "2mo": what each answer would do, shown on the buttons. */
export function intervalLabel(card: Card, grade: Grade, now = Date.now()) {
  if (grade === 0) return '10m';
  const days = schedule(card, grade, now).interval;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return '1y';
}

export function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const endOfDay = (ms = Date.now()) => startOfDay(ms) + DAY - 1;

// ── Today's queue ──────────────────────────────────────────────────────────

const LIMIT_KEY = 'reelmind.newPerDay';
export const NEW_LIMIT_CHOICES = [5, 10, 15, 25, 50];

export function newPerDay(): number {
  try {
    const n = Number(localStorage.getItem(LIMIT_KEY));
    return NEW_LIMIT_CHOICES.includes(n) ? n : 15;
  } catch {
    return 15;
  }
}

export function setNewPerDay(n: number) {
  try {
    localStorage.setItem(LIMIT_KEY, String(n));
  } catch {
    /* preference just won't persist */
  }
}

/** Cards to study today: everything due, plus new cards up to the daily limit. */
export function todaysQueue(cards: Card[], reviews: ReviewLog[], limit = newPerDay(), now = Date.now()) {
  const today = startOfDay(now);
  const newToday = reviews.filter((r) => r.isNew && Date.parse(r.at) >= today).length;
  const due = cards.filter((c) => !isNew(c) && Date.parse(c.due) <= endOfDay(now)).sort((a, b) => a.due.localeCompare(b.due));
  const fresh = cards
    .filter(isNew)
    .sort((a, b) => b.due.localeCompare(a.due) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit - newToday));
  return { due, fresh, queue: [...due, ...fresh], newToday };
}

/** Days in a row with at least one answer, counting today or ending yesterday. */
export function streak(reviews: ReviewLog[], now = Date.now()) {
  const days = new Set(reviews.map((r) => startOfDay(Date.parse(r.at))));
  let day = startOfDay(now);
  if (!days.has(day)) day = startOfDay(day - DAY / 2);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = startOfDay(day - DAY / 2);
  }
  return n;
}

/** Saves an answer. */
export async function answer(card: Card, grade: Grade) {
  const next = schedule(card, grade);
  await db.transaction('rw', db.cards, db.reviews, db.reels, async () => {
    await db.cards.put(next);
    await db.reviews.add({ cardId: card.id, at: next.lastReviewed!, grade, isNew: isNew(card) });
    await db.reels.update(card.shortcode, { lastReviewedAt: next.lastReviewed });
  });
  return next;
}
