// Exports your notes as Markdown files in one ZIP:
//   Obsidian: unzip into your vault; [[links]] between related reels and topics work as-is.
//   Notion: Settings, Import, "Text & Markdown", and pick the ZIP.
import JSZip from 'jszip';
import { linksOf } from './links';
import { CONTENT_MOODS } from './emotion';
import { topicLabel } from './topics';
import type { Analysis, Link, Reel, TopicBoard } from './types';

const unsafe = /[\\/:*?"<>|#^[\]]/g;

function fileName(title: string, shortcode: string) {
  const clean = title.replace(unsafe, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Reel';
  return `${clean} (${shortcode})`;
}

const yamlString = (s: string) => JSON.stringify(s ?? '');

function reelNote(reel: Reel, a: Analysis, names: Map<string, string>, links: Link[]) {
  const related = linksOf(reel.shortcode, links).filter((l) => names.has(l.other));
  const lines = [
    '---',
    `title: ${yamlString(a.title)}`,
    `creator: ${yamlString(reel.creator)}`,
    `url: ${reel.url}`,
    `saved: ${reel.savedAt?.slice(0, 10) ?? ''}`,
    `type: ${(CONTENT_MOODS[a.contentType] || CONTENT_MOODS.other).label}`,
    `difficulty: ${a.difficulty}`,
    `topic: ${yamlString(topicLabel(a.primaryTopic))}`,
    `tags: [${a.topics.map((t) => yamlString(t.replace(/\s+/g, '-'))).join(', ')}]`,
    `practised: ${Boolean(reel.practiceDone)}`,
    '---',
    '',
    `# ${a.title}`,
    '',
    `Topic: [[${topicLabel(a.primaryTopic)}]] · [Watch on Instagram](${reel.url})`,
    '',
    a.summary,
    '',
  ];
  if (a.keyPoints.length) lines.push('## Key points', '', ...a.keyPoints.map((p) => `- ${p}`), '');
  if (a.practiceTask.title || a.practiceTask.steps.length) {
    lines.push(`## Practice: ${a.practiceTask.title || 'Try it yourself'}`, '', `- [${reel.practiceDone ? 'x' : ' '}] Done`, '', ...a.practiceTask.steps.map((s, i) => `${i + 1}. ${s}`), '');
    if (a.practiceTask.code) lines.push('```' + (a.practiceTask.language || ''), a.practiceTask.code, '```', '');
  }
  if (a.tools.length) lines.push('## Tools and links', '', ...a.tools.map((t) => `- ${t.url ? `[${t.name}](${t.url})` : t.name}${t.note ? `: ${t.note}` : ''}`), '');
  if (related.length) lines.push('## Related reels', '', ...related.map((l) => `- [[${names.get(l.other)}]] (${l.reason})`), '');
  if (a.transcript) lines.push('## Transcript', '', a.transcript, '');
  return lines.join('\n');
}

function topicNote(topic: string, list: { reel: Reel; analysis: Analysis }[], names: Map<string, string>, board: TopicBoard | undefined) {
  const lines = [`# ${topicLabel(topic)}`, '', `${list.length} saved ${list.length === 1 ? 'reel' : 'reels'}.`, '', '## Reels', '', ...list.map((i) => `- [[${names.get(i.reel.shortcode)}]]`), ''];
  if (board) {
    lines.push('## Overview', '', board.overview, '');
    if (board.learningPath.length) {
      lines.push('## Learning path', '');
      board.learningPath.forEach((s, i) => lines.push(`${i + 1}. **${s.title}**: ${s.detail} ${s.reelIds.map((id) => (names.has(id) ? `[[${names.get(id)}]]` : '')).join(' ')}`));
      lines.push('');
    }
    if (board.agreements.length) lines.push('## Where they agree', '', ...board.agreements.map((x) => `- ${x}`), '');
    if (board.contradictions.length) lines.push('## Where they disagree', '', ...board.contradictions.map((x) => `- ${x}`), '');
    if (board.project.title) lines.push(`## Project: ${board.project.title}`, '', board.project.goal, '', ...board.project.steps.map((s, i) => `${i + 1}. ${s}`), '');
  }
  return lines.join('\n');
}

export async function exportMarkdown(items: { reel: Reel; analysis: Analysis }[], links: Link[], boards: TopicBoard[]) {
  const zip = new JSZip();
  const names = new Map(items.map((i) => [i.reel.shortcode, fileName(i.analysis.title, i.reel.shortcode)]));
  const byTopic = new Map<string, typeof items>();
  for (const it of items) {
    const t = it.analysis.primaryTopic;
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t)!.push(it);
    zip.file(`ReelMind/Reels/${names.get(it.reel.shortcode)}.md`, reelNote(it.reel, it.analysis, names, links));
  }
  const boardOf = new Map(boards.map((b) => [b.topic, b]));
  for (const [topic, list] of byTopic) {
    zip.file(`ReelMind/Topics/${topicLabel(topic).replace(unsafe, '')}.md`, topicNote(topic, list, names, boardOf.get(topic)));
  }
  zip.file(
    'ReelMind/ReelMind.md',
    [
      '# ReelMind notes',
      '',
      `Exported ${new Date().toLocaleDateString()} with ${items.length} reels in ${byTopic.size} topics.`,
      '',
      '## Topics',
      '',
      ...[...byTopic.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `- [[${topicLabel(t).replace(unsafe, '')}]] (${l.length})`),
      '',
    ].join('\n'),
  );
  return zip.generateAsync({ type: 'blob' });
}
