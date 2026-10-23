// Turns any set of reels into a summary of the length you want, with links. Built in the browser
// from notes you already have, so it's instant and costs no AI calls.
import { CONTENT_MOODS } from './emotion';
import { topicLabel } from './topics';
import type { Analysis, Reel } from './types';

export type SummaryLength = 'line' | 'short' | 'paragraph' | 'full';
export type SummaryFormat = 'text' | 'markdown';

export interface SummarySections {
  recap: boolean;
  takeaways: boolean;
  actions: boolean;
  tools: boolean;
}

export interface SummaryOptions {
  length: SummaryLength;
  sections: SummarySections;
  withLinks: boolean;
  format: SummaryFormat;
}

export const DEFAULT_SUMMARY: SummaryOptions = {
  length: 'short',
  sections: { recap: true, takeaways: true, actions: true, tools: true },
  withLinks: true,
  format: 'text',
};

export interface SummaryItem {
  reel: Reel;
  analysis: Analysis;
}

const LEVEL: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function byTopic(items: SummaryItem[]) {
  const map = new Map<string, SummaryItem[]>();
  for (const it of items) {
    const t = it.analysis.primaryTopic || 'unsorted';
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(it);
  }
  for (const list of map.values()) list.sort((a, b) => (b.reel.savedAt || '').localeCompare(a.reel.savedAt || ''));
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/** One strong idea per topic, biggest topics first. */
export function takeaways(items: SummaryItem[], max: number) {
  const out: { text: string; item: SummaryItem }[] = [];
  for (const [, list] of byTopic(items)) {
    const best = list.find((i) => i.analysis.keyPoints.length) || list[0];
    const text = best.analysis.keyPoints[0] || best.analysis.summary.split('. ')[0];
    if (text) out.push({ text: text.replace(/\.$/, ''), item: best });
    if (out.length >= max) break;
  }
  return out;
}

/** Practice tasks not done yet, easiest first. */
export function actions(items: SummaryItem[], max: number) {
  return items
    .filter((i) => !i.reel.practiceDone && i.analysis.practiceTask.title)
    .sort((a, b) => (LEVEL[a.analysis.difficulty] ?? 1) - (LEVEL[b.analysis.difficulty] ?? 1))
    .slice(0, max)
    .map((item) => ({ text: item.analysis.practiceTask.title, item }));
}

/** Every tool, with how many reels mention it. */
export function toolList(items: SummaryItem[]) {
  const map = new Map<string, { name: string; url: string; count: number }>();
  for (const it of items) {
    for (const t of it.analysis.tools) {
      const key = t.name.trim().toLowerCase();
      if (!key) continue;
      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
        prev.url ||= t.url;
      } else map.set(key, { name: t.name.trim(), url: t.url, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildSummary(items: SummaryItem[], opts: SummaryOptions, title = 'My saved reels'): string {
  if (!items.length) return 'No reels in this selection yet.';
  const md = opts.format === 'markdown';
  const link = (label: string, url: string) => (opts.withLinks && url ? (md ? `[${label}](${url})` : `${label} (${url})`) : label);
  const reelLink = (it: SummaryItem) => link(it.analysis.title, it.reel.url);
  const bullet = md ? '- ' : '• ';
  const heading = (t: string) => (md ? `## ${t}` : t.toUpperCase());
  const topics = byTopic(items);
  const count = `${items.length} ${items.length === 1 ? 'reel' : 'reels'} in ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`;
  const topicNames = (n: number) =>
    topics
      .slice(0, n)
      .map(([t, l]) => `${topicLabel(t)} (${l.length})`)
      .join(', ') + (topics.length > n ? `, +${topics.length - n} more` : '');
  const s = opts.sections;

  if (opts.length === 'line') {
    const parts = [`${title}: ${count}, mostly ${topicNames(3)}.`];
    const top = takeaways(items, 1)[0];
    if (s.takeaways && top) parts.push(`Key idea: ${top.text}.`);
    const next = actions(items, 1)[0];
    if (s.actions && next) parts.push(`Next: ${next.text}.`);
    let line = parts.join(' ');
    if (opts.withLinks) {
      const links = takeaways(items, 3).map((t) => link(t.item.analysis.title, t.item.reel.url));
      if (links.length) line += md ? ` ${links.join(', ')}` : ` Links: ${takeaways(items, 3).map((t) => t.item.reel.url).join(' ')}`;
    }
    return line;
  }

  if (opts.length === 'short') {
    const lines = [`${title}: ${count}.`];
    if (s.recap) lines.push(`Topics: ${topicNames(5)}.`);
    const tk = takeaways(items, 3);
    if (s.takeaways && tk.length) {
      const withUrl = (t: (typeof tk)[number]) => (!opts.withLinks ? t.text : md ? `${t.text} ([watch](${t.item.reel.url}))` : `${t.text} (${t.item.reel.url})`);
      lines.push(`Key ideas: ${tk.map(withUrl).join('; ')}.`);
    }
    const ac = actions(items, 2);
    if (s.actions && ac.length) lines.push(`Try next: ${ac.map((a) => a.text).join('; ')}.`);
    if (s.tools) {
      const tl = toolList(items).slice(0, 5);
      if (tl.length) lines.push(`Tools: ${tl.map((t) => link(t.name, t.url)).join(', ')}.`);
    }
    return lines.join('\n');
  }

  const full = opts.length === 'full';
  const out: string[] = [md ? `# ${title}` : title, '', `${count}.`, ''];

  if (s.recap) {
    out.push(heading('Topics'), '');
    for (const [t, list] of topics) {
      const types = [...new Set(list.map((i) => (CONTENT_MOODS[i.analysis.contentType] || CONTENT_MOODS.other).label.toLowerCase()))].join(', ');
      if (full) {
        out.push(md ? `### ${topicLabel(t)} (${list.length})` : `${topicLabel(t)} (${list.length}, ${types})`);
        for (const it of list) {
          out.push(`${bullet}${reelLink(it)}${it.reel.creator ? `, @${it.reel.creator}` : ''}`);
          out.push(`  ${it.analysis.summary}`);
        }
        out.push('');
      } else {
        const gist = list
          .slice(0, 3)
          .map((i) => i.analysis.title)
          .join('; ');
        out.push(`${bullet}${topicLabel(t)} (${list.length}, ${types}): ${gist}${list.length > 3 ? '…' : ''}`);
        if (opts.withLinks) out.push(`  ${list.slice(0, 3).map((i) => link('watch', i.reel.url)).join(' ')}`);
      }
    }
    out.push('');
  }

  if (s.takeaways) {
    const tk = takeaways(items, full ? 12 : 5);
    if (tk.length) {
      out.push(heading('Top takeaways'), '');
      tk.forEach((t) => out.push(`${bullet}${t.text}${opts.withLinks ? ` (${link('from ' + t.item.analysis.title, t.item.reel.url)})` : ''}`));
      out.push('');
    }
  }

  if (s.actions) {
    const ac = actions(items, full ? 50 : 5);
    if (ac.length) {
      out.push(heading('What to practise next'), '');
      ac.forEach((a, i) => out.push(`${md ? `${i + 1}. ` : `${i + 1}. `}${a.text}${opts.withLinks ? ` (${link(a.item.analysis.title, a.item.reel.url)})` : ''}`));
      out.push('');
    }
  }

  if (s.tools) {
    const tl = toolList(items).slice(0, full ? 100 : 10);
    if (tl.length) {
      out.push(heading('Tools and resources'), '');
      tl.forEach((t) => out.push(`${bullet}${link(t.name, t.url)}${t.count > 1 ? ` (in ${t.count} reels)` : ''}`));
      out.push('');
    }
  }

  out.push(md ? '_Made with [ReelMind](https://github.com/sisi-tarak/reelmind)_' : 'Made with ReelMind');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
