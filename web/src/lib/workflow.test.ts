import { describe, expect, it } from 'vitest';
import type { Analysis, Reel } from './types';
import { buildWorkflow, neighbourhood } from './workflow';

function item(shortcode: string, primaryTopic: string, topics: string[], tools: string[], contentType = 'tutorial') {
  const reel: Reel = { shortcode, url: '', creator: 'c', savedAt: '2026-10-20T00:00:00.000Z', importedAt: '', status: 'analyzed' };
  const analysis = {
    shortcode,
    primaryTopic,
    topics,
    contentType,
    analyzedAt: '2026-10-20T00:00:00.000Z',
    tools: tools.map((name) => ({ name, kind: 'tool', url: '', note: '' })),
  } as unknown as Analysis;
  return { reel, analysis };
}

describe('buildWorkflow', () => {
  const items = [
    item('a1', 'rag', ['rag', 'ai agents'], ['Chroma', 'Claude API']),
    item('a2', 'rag', ['rag'], ['Chroma']),
    item('b1', 'ai agents', ['ai agents'], ['Claude API', 'n8n'], 'tool'),
  ];
  const { nodes, edges } = buildWorkflow(items);

  it('makes one root, one sticky and one hub per topic', () => {
    expect(nodes.filter((n) => n.kind === 'root')).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === 'section').map((n) => n.data.topic)).toEqual(['rag', 'ai agents']);
    expect(nodes.filter((n) => n.kind === 'hub')).toHaveLength(2);
  });

  it('keeps one node per tool and marks cross-topic tools as shared', () => {
    const tools = nodes.filter((n) => n.kind === 'tool');
    expect(tools.map((t) => t.data.name).sort()).toEqual(['Chroma', 'Claude API', 'n8n']);
    expect(tools.find((t) => t.data.name === 'Claude API')!.data.shared).toBe(true);
    expect(tools.find((t) => t.data.name === 'Chroma')!.data.shared).toBe(false);
  });

  it('links related reels across topics by a shared tag', () => {
    const rel = edges.filter((e) => e.kind === 'related');
    expect(rel).toHaveLength(1);
    expect(rel[0].label).toBe('Same tool: Claude API');
  });

  it('focusing a topic shows its reels and their tools', () => {
    const near = neighbourhood('hub:rag', edges);
    expect([...near].sort()).toEqual(['a1', 'a2', 'hub:rag', 'root', 'tool:chroma', 'tool:claude api'].sort());
  });
});
