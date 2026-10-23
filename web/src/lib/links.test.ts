import { describe, expect, it } from 'vitest';
import { computeLinks, cosine, linksOf } from './links';
import type { Analysis } from './types';

const a = (shortcode: string, topics: string[], tools: string[] = []) =>
  ({ shortcode, topics, primaryTopic: topics[0], tools: tools.map((name) => ({ name, kind: 'tool', url: '', note: '' })) }) as unknown as Analysis;

describe('computeLinks', () => {
  it('links by meaning when fingerprints exist', () => {
    const list = [a('r1', ['rag']), a('r2', ['vector databases']), a('r3', ['git'])];
    const vectors = new Map([
      ['r1', [1, 0.9, 0]],
      ['r2', [0.95, 1, 0.05]],
      ['r3', [0, 0, 1]],
    ]);
    const links = computeLinks(list, vectors);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 'r1', b: 'r2', reason: 'Similar idea' });
  });

  it('falls back to shared tags and tools, naming the reason', () => {
    const links = computeLinks([a('r1', ['rag'], ['Chroma']), a('r2', ['agents'], ['Chroma']), a('r3', ['git'])], new Map());
    expect(links).toHaveLength(1);
    expect(links[0].reason).toBe('Same tool: Chroma');
    expect(linksOf('r2', links)[0].other).toBe('r1');
  });

  it('cosine is 1 for identical direction', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });
});
