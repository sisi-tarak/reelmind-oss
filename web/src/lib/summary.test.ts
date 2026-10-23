import { describe, expect, it } from 'vitest';
import { buildSummary, DEFAULT_SUMMARY, toolList } from './summary';
import type { Analysis, Reel } from './types';

function item(id: string, topic: string, opts: Partial<Analysis> = {}, reel: Partial<Reel> = {}) {
  return {
    reel: { shortcode: id, url: `https://www.instagram.com/reel/${id}/`, creator: 'c', savedAt: '2026-10-20T00:00:00.000Z', importedAt: '', status: 'analyzed', ...reel } as Reel,
    analysis: {
      shortcode: id,
      title: `Reel ${id}`,
      summary: `Summary ${id}.`,
      keyPoints: [`Point from ${id}`],
      topics: [topic],
      primaryTopic: topic,
      contentType: 'tutorial',
      difficulty: 'beginner',
      practiceTask: { title: `Practise ${id}`, steps: [], code: '', language: '' },
      tools: [{ name: 'Chroma', kind: 'library', url: 'https://www.trychroma.com', note: '' }],
      ...opts,
    } as Analysis,
  };
}

const items = [item('a1', 'rag'), item('a2', 'rag'), item('b1', 'git', { tools: [] }, { practiceDone: true })];

describe('buildSummary', () => {
  it('one line stays on one line and carries links', () => {
    const s = buildSummary(items, { ...DEFAULT_SUMMARY, length: 'line' });
    expect(s.split('\n')).toHaveLength(1);
    expect(s).toContain('3 reels in 2 topics');
    expect(s).toContain('https://www.instagram.com/reel/');
  });

  it('short is two to five lines', () => {
    const lines = buildSummary(items, DEFAULT_SUMMARY).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('skips practised reels in the action list and respects sections', () => {
    const s = buildSummary(items, { ...DEFAULT_SUMMARY, length: 'full', sections: { recap: false, takeaways: false, actions: true, tools: false } });
    expect(s).toContain('Practise a1');
    expect(s).not.toContain('Practise b1');
    expect(s).not.toContain('TOOLS');
  });

  it('markdown uses real links; links can be turned off', () => {
    expect(buildSummary(items, { ...DEFAULT_SUMMARY, length: 'paragraph', format: 'markdown' })).toMatch(/\[[^\]]+\]\(https:\/\/www\.instagram\.com/);
    expect(buildSummary(items, { ...DEFAULT_SUMMARY, length: 'paragraph', withLinks: false })).not.toContain('instagram.com');
  });

  it('counts tools across reels', () => {
    expect(toolList(items)[0]).toMatchObject({ name: 'Chroma', count: 2 });
  });
});
