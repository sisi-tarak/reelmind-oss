import { describe, expect, it } from 'vitest';
import { categoryMarkdown, collectAssets, contentOf, skillMarkdown, skillNameOf, toolsCsv, zipEntries } from './assets';
import type { Analysis, Reel } from './types';

const reel = (sc: string): Reel => ({ shortcode: sc, url: `https://www.instagram.com/reel/${sc}/`, creator: 'dev', savedAt: null, importedAt: '', status: 'analyzed' });
const analysis = (sc: string, extra: Partial<Analysis> = {}) =>
  ({
    shortcode: sc,
    title: `Reel ${sc}`,
    primaryTopic: 'git',
    tools: [{ name: 'GitHub', kind: 'website', url: 'https://github.com', note: 'Hosts code' }],
    assets: {
      skills: [{ name: 'commit-writer', description: 'Writes commits: use for diffs', instructions: '# Steps\n1. Read' }],
      prompts: [{ title: 'Review', prompt: 'Review [diff]', useFor: 'PRs' }],
      snippets: [{ title: 'Undo commit', language: 'bash', code: 'git reset --soft HEAD~1' }],
      workflows: [],
    },
    ...extra,
  }) as unknown as Analysis;

describe('library', () => {
  const items = collectAssets([
    { reel: reel('aaaaa'), analysis: analysis('aaaaa') },
    { reel: reel('bbbbb'), analysis: analysis('bbbbb') },
  ]);
  it('collects every kind and merges tools across reels', () => {
    expect(items.filter((i) => i.kind === 'skill')).toHaveLength(2);
    const tools = items.filter((i) => i.kind === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0].sources).toHaveLength(2);
    expect(tools[0].subtitle).toContain('in 2 reels');
  });
  it('writes valid SKILL.md front matter', () => {
    const md = skillMarkdown({ name: 'x', description: 'Use when: a diff', instructions: 'Body' });
    expect(md).toBe('---\nname: x\ndescription: "Use when: a diff"\n---\n\nBody\n');
    expect(skillNameOf(md, 'fallback')).toBe('x');
    expect(skillNameOf('no front matter', 'My Skill')).toBe('my-skill');
  });
  it('uses your edit, and zips without name clashes', () => {
    const skill = items.find((i) => i.kind === 'skill')!;
    const edits = new Map([[skill.id, { id: skill.id, content: '---\nname: renamed\n---\nNew', updatedAt: '' }]]);
    expect(contentOf(skill, edits)).toContain('New');
    const paths = zipEntries(items.filter((i) => i.kind !== 'tool'), edits).map((e) => e.path);
    expect(paths).toContain('renamed/SKILL.md');
    expect(paths).toContain('commit-writer/SKILL.md');
    expect(paths).toContain('undo-commit.sh');
    expect(paths).toContain('undo-commit-2.sh');
    expect(new Set(paths).size).toBe(paths.length);
  });
  it('exports documents and CSV', () => {
    const prompts = items.filter((i) => i.kind === 'prompt');
    const md = categoryMarkdown('prompt', prompts, new Map());
    expect(md).toContain('# Prompts from my saved reels');
    expect(md).toContain('Review [diff]');
    expect(md).toContain('From: [Reel aaaaa](https://www.instagram.com/reel/aaaaa/) by @dev');
    expect(toolsCsv(items.filter((i) => i.kind === 'tool')).split('\n')[1]).toContain('"GitHub","https://github.com","Hosts code"');
  });
});
