import { describe, expect, it } from 'vitest';
import { autoCards, cloze, schedule, streak, todaysQueue } from './review';
import type { Analysis, Card } from './types';

const base: Card = { id: 'a:auto:0', shortcode: 'a', front: 'q', back: 'a', source: 'auto', due: new Date(0).toISOString(), interval: 0, ease: 2.5, reps: 0, lapses: 0 };
const NOW = new Date('2026-10-21T10:00:00').getTime();

describe('schedule', () => {
  it('grows intervals with Good answers', () => {
    const one = schedule(base, 2, NOW);
    expect(one.interval).toBe(1);
    const two = schedule(one, 2, NOW);
    expect(two.interval).toBe(3);
    const three = schedule(two, 2, NOW);
    expect(three.interval).toBeGreaterThanOrEqual(7);
  });
  it('Again brings the card back in minutes and counts a lapse', () => {
    const learned = schedule(schedule(base, 2, NOW), 2, NOW);
    const again = schedule(learned, 0, NOW);
    expect(again.reps).toBe(0);
    expect(again.lapses).toBe(1);
    expect(Date.parse(again.due) - NOW).toBe(10 * 60_000);
    expect(again.ease).toBeLessThan(learned.ease);
  });
  it('Easy jumps ahead', () => {
    expect(schedule(base, 3, NOW).interval).toBe(4);
  });
});

describe('queue and streak', () => {
  it('limits new cards per day', () => {
    const cards = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `c${i}` }));
    const reviews = [{ cardId: 'x', at: new Date(NOW - 1000).toISOString(), grade: 2, isNew: true }];
    expect(todaysQueue(cards, reviews, 10, NOW).fresh).toHaveLength(9);
  });
  it('includes cards due today, not tomorrow', () => {
    const due = { ...base, id: 'd', lastReviewed: 'x', due: new Date(NOW + 3600_000).toISOString() };
    const later = { ...base, id: 'l', lastReviewed: 'x', due: new Date(NOW + 2 * 86400_000).toISOString() };
    expect(todaysQueue([due, later], [], 10, NOW).due.map((c) => c.id)).toEqual(['d']);
  });
  it('counts consecutive days', () => {
    const at = (d: number) => ({ cardId: 'x', grade: 2, at: new Date(NOW - d * 86400_000).toISOString() });
    expect(streak([at(0), at(1), at(2), at(4)], NOW)).toBe(3);
    expect(streak([at(1), at(2)], NOW)).toBe(2);
    expect(streak([at(3)], NOW)).toBe(0);
  });
});

describe('auto cards', () => {
  it('hides a telling word', () => {
    expect(cloze('Use git stash to park unfinished work')?.answer).toBe('unfinished');
    expect(cloze('Run npx shadcn to add components')?.answer).toBe('components');
    expect(cloze('Next.js caches fetches by default')?.answer).toBe('Next.js');
  });
  it('builds cards from notes', () => {
    const a = { title: 'Git stash', summary: 'Stash parks work. It is handy.', keyPoints: ['Use git stash to park unfinished work'], practiceTask: { title: 'Stash a change' } } as unknown as Analysis;
    const cards = autoCards(a);
    expect(cards[0].back).toBe('Stash parks work.');
    expect(cards.some((c) => c.front.includes('_____'))).toBe(true);
  });
});
