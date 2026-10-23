import { describe, expect, it } from 'vitest';
import { hash, mergeCards, mergeItem, mergeNewest, stable, syncable, type ItemPayload } from './cloud';
import type { Analysis, Card, Reel } from './types';

const reel = (p: Partial<Reel> = {}): Reel => ({ shortcode: 'abc12', url: 'u', creator: '', savedAt: null, importedAt: '2026-10-01', status: 'new', ...p });
const analysis = (at: string, p: Partial<Analysis> = {}) => ({ shortcode: 'abc12', analyzedAt: at, provider: 'gemini', title: at, ...p }) as Analysis;

describe('mergeItem', () => {
  it('never loses an analysis', () => {
    const local: ItemPayload = { reel: reel(), analysis: null, embedding: null };
    const remote: ItemPayload = { reel: reel({ status: 'analyzed' }), analysis: analysis('2026-10-02'), embedding: [1] };
    const m = mergeItem(local, remote);
    expect(m.reel.status).toBe('analyzed');
    expect(m.analysis?.title).toBe('2026-10-02');
    expect(m.embedding).toEqual([1]);
    expect(mergeItem(remote, local).analysis?.title).toBe('2026-10-02');
  });
  it('keeps the newest analysis and combines progress', () => {
    const a: ItemPayload = { reel: reel({ status: 'analyzed', practiceDone: true, collections: ['x'] }), analysis: analysis('2026-10-02'), embedding: [1] };
    const b: ItemPayload = { reel: reel({ status: 'analyzed', creator: 'dev', collections: ['y'], lastReviewedAt: '2026-10-05' }), analysis: analysis('2026-10-04'), embedding: [2] };
    const m = mergeItem(a, b);
    expect(m.analysis?.title).toBe('2026-10-04');
    expect(m.embedding).toEqual([2]);
    expect(m.reel.practiceDone).toBe(true);
    expect(m.reel.creator).toBe('dev');
    expect(m.reel.collections?.sort()).toEqual(['x', 'y']);
    expect(m.reel.lastReviewedAt).toBe('2026-10-05');
  });
  it('converges whichever side merges', () => {
    const a: ItemPayload = { reel: reel({ status: 'analyzed', practiceDone: true }), analysis: analysis('2026-10-02'), embedding: null };
    const b: ItemPayload = { reel: reel({ status: 'analyzed', creator: 'dev' }), analysis: analysis('2026-10-04'), embedding: [2] };
    expect(hash(stable(mergeItem(a, b)))).toBe(hash(stable(mergeItem(b, a))));
  });
});

describe('cards, boards and helpers', () => {
  const card = (id: string, last?: string): Card => ({ id, shortcode: 'abc12', front: 'f', back: last || 'b', source: 'ai', due: '', interval: 1, ease: 2.5, reps: 1, lapses: 0, lastReviewed: last });
  it('keeps the most recently answered card', () => {
    const m = mergeCards([card('1', '2026-10-01'), card('2')], [card('1', '2026-10-03'), card('3')]);
    expect(m.map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(m[0].lastReviewed).toBe('2026-10-03');
  });
  it('keeps the newer board', () => {
    expect(mergeNewest({ createdAt: '2' }, { createdAt: '1' }).createdAt).toBe('2');
    expect(mergeNewest(undefined, { createdAt: '1' }).createdAt).toBe('1');
  });
  it('sorts keys so hashes match across devices', () => {
    expect(stable({ b: 1, a: { d: 1, c: undefined } })).toBe('{"a":{"d":1},"b":1}');
  });
  it('keeps samples and demo results local', () => {
    expect(syncable(reel({ collections: ['ReelMind sample'] }))).toBe(false);
    expect(syncable(reel(), analysis('x', { provider: 'demo' }))).toBe(false);
    expect(syncable(reel(), analysis('x'))).toBe(true);
  });
});
