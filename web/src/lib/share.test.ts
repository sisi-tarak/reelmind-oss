import { describe, expect, it } from 'vitest';
import { makeShareLink, readShareLink } from './share';
import type { Analysis, Reel } from './types';

const item = (id: string) => ({
  reel: { shortcode: id, url: `https://www.instagram.com/reel/${id}/`, creator: 'dev', savedAt: null, importedAt: '', status: 'analyzed' } as Reel,
  analysis: {
    shortcode: id,
    title: `Reel ${id} — తెలుగు`,
    summary: 'A summary. Second sentence.',
    keyPoints: ['one', 'two'],
    primaryTopic: 'rag',
    topics: ['rag'],
    contentType: 'tutorial',
    difficulty: 'beginner',
    tools: [{ name: 'Chroma', kind: 'library', url: 'https://www.trychroma.com', note: '' }],
    practiceTask: { title: 'Do it', steps: [], code: '', language: '' },
  } as unknown as Analysis,
});

describe('share links', () => {
  it('round-trips notes through the link, including non-English text', async () => {
    const { url, reels } = await makeShareLink('My RAG notes', [item('AAAAA11111'), item('BBBBB22222')]);
    expect(reels).toBe(2);
    expect(url).toContain('/s#');
    const back = await readShareLink(url.split('#')[1]);
    expect(back.title).toBe('My RAG notes');
    expect(back.reels[0].t).toContain('తెలుగు');
    expect(back.reels[1].o?.[0].u).toBe('https://www.trychroma.com');
  });

  it('rejects junk', async () => {
    await expect(readShareLink('#nope')).rejects.toBeTruthy();
  });
});
