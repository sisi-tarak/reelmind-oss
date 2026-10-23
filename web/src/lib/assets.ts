// The Library: skills, prompts, code, workflows and tools pulled out of your reels, ready to copy,
// download or customize. Pure helpers here; storage of your edits lives in db.assetEdits.
import type { Analysis, AssetEdit, Reel } from './types';

export type AssetKind = 'skill' | 'prompt' | 'snippet' | 'workflow' | 'tool';

export const CATEGORIES: { kind: AssetKind; label: string; one: string; hint: string }[] = [
  { kind: 'skill', label: 'Claude skills', one: 'skill', hint: 'Ready-to-use SKILL.md files. Upload the .zip in Claude, Settings, Capabilities, or put the folder in ~/.claude/skills for Claude Code.' },
  { kind: 'prompt', label: 'Prompts', one: 'prompt', hint: 'Prompts from your reels, ready to paste. Parts to fill in look [like this].' },
  { kind: 'snippet', label: 'Code', one: 'snippet', hint: 'Commands, code and config shown in your reels.' },
  { kind: 'workflow', label: 'Workflows', one: 'workflow', hint: 'Automations and multi-step workflows, step by step.' },
  { kind: 'tool', label: 'Tools & links', one: 'tool', hint: 'Every tool, library and site your reels mention, once each, with its link.' },
];

export interface SourceReel {
  shortcode: string;
  title: string;
  creator: string;
  url: string;
  topic: string;
}

export interface AssetItem {
  id: string;
  kind: AssetKind;
  title: string;
  /** One line under the title: a skill's description, what a prompt is for, the language. */
  subtitle: string;
  /** The original text: SKILL.md, prompt, code, workflow Markdown or tool line. */
  original: string;
  language: string;
  sources: SourceReel[];
  url?: string;
}

const LANG_EXT: Record<string, string> = {
  bash: 'sh', shell: 'sh', sh: 'sh', zsh: 'sh', powershell: 'ps1', python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx',
  json: 'json', yaml: 'yml', yml: 'yml', html: 'html', css: 'css', sql: 'sql', go: 'go', rust: 'rs', java: 'java', kotlin: 'kt', swift: 'swift', php: 'php', ruby: 'rb',
  markdown: 'md', md: 'md', dockerfile: 'Dockerfile', toml: 'toml', c: 'c', cpp: 'cpp', csharp: 'cs', dart: 'dart', text: 'txt',
};

export const slugify = (s: string, max = 60) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '') || 'item';

/** YAML-safe one-line string. */
const yaml = (s: string) => (/^[\w .,()'-]+$/.test(s) && !/^\s|\s$/.test(s) ? s : JSON.stringify(s));

export function skillMarkdown(k: { name: string; description: string; instructions: string }) {
  return `---\nname: ${k.name}\ndescription: ${yaml(k.description.replace(/\s+/g, ' ').trim())}\n---\n\n${k.instructions.trim()}\n`;
}

/** Reads the name back from a (possibly edited) SKILL.md, for the folder name. */
export function skillNameOf(markdown: string, fallback: string) {
  const m = markdown.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  const name = m?.[1].match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1].trim();
  return slugify(name || fallback, 64);
}

function workflowMarkdown(w: { title: string; goal: string; steps: string[]; tools: string[] }) {
  return [`# ${w.title}`, '', w.goal, '', '## Steps', '', ...w.steps.map((s, i) => `${i + 1}. ${s}`), ...(w.tools.length ? ['', '## Tools', '', ...w.tools.map((t) => `- ${t}`)] : [])].join('\n').trim() + '\n';
}

/** Every reusable item in these reels. Tools are merged across reels; the rest stay one per reel. */
export function collectAssets(items: { reel: Reel; analysis: Analysis }[]): AssetItem[] {
  const out: AssetItem[] = [];
  const tools = new Map<string, AssetItem>();
  for (const { reel, analysis: a } of items) {
    const src: SourceReel = { shortcode: reel.shortcode, title: a.title, creator: reel.creator, url: reel.url, topic: a.primaryTopic };
    const as = a.assets;
    as?.skills.forEach((k, i) =>
      out.push({ id: `${reel.shortcode}:skill:${i}`, kind: 'skill', title: k.name, subtitle: k.description, original: skillMarkdown(k), language: 'markdown', sources: [src] }),
    );
    as?.prompts.forEach((p, i) => out.push({ id: `${reel.shortcode}:prompt:${i}`, kind: 'prompt', title: p.title, subtitle: p.useFor, original: p.prompt, language: 'text', sources: [src] }));
    as?.snippets.forEach((c, i) =>
      out.push({ id: `${reel.shortcode}:snippet:${i}`, kind: 'snippet', title: c.title, subtitle: c.language, original: c.code, language: c.language || 'text', sources: [src] }),
    );
    as?.workflows.forEach((w, i) =>
      out.push({ id: `${reel.shortcode}:workflow:${i}`, kind: 'workflow', title: w.title, subtitle: w.goal, original: workflowMarkdown(w), language: 'markdown', sources: [src] }),
    );
    for (const t of a.tools) {
      const key = t.name.trim().toLowerCase();
      if (!key) continue;
      const have = tools.get(key);
      if (have) {
        if (!have.sources.some((s) => s.shortcode === src.shortcode)) have.sources.push(src);
        if (!have.url && t.url) have.url = t.url;
        continue;
      }
      tools.set(key, { id: `tool:${slugify(key)}`, kind: 'tool', title: t.name, subtitle: t.note || t.kind, original: '', language: 'text', sources: [src], url: t.url || undefined });
    }
  }
  for (const t of tools.values()) {
    t.original = `${t.title}${t.url ? ` (${t.url})` : ''}${t.subtitle ? `: ${t.subtitle}` : ''}`;
    t.subtitle = `${t.subtitle}${t.sources.length > 1 ? ` · in ${t.sources.length} reels` : ''}`;
    out.push(t);
  }
  return out;
}

export function contentOf(item: AssetItem, edits: Map<string, AssetEdit>) {
  const e = edits.get(item.id);
  return e && e.content ? e.content : item.original;
}

export function fileNameOf(item: AssetItem) {
  if (item.kind === 'skill') return 'SKILL.md';
  if (item.kind === 'snippet') {
    const ext = LANG_EXT[item.language.toLowerCase()] || 'txt';
    return ext === 'Dockerfile' ? 'Dockerfile' : `${slugify(item.title)}.${ext}`;
  }
  if (item.kind === 'workflow') return `${slugify(item.title)}.md`;
  return `${slugify(item.title)}.${item.kind === 'prompt' ? 'txt' : 'md'}`;
}

/** One Markdown document for a whole category, with the reel each item came from. */
export function categoryMarkdown(kind: AssetKind, items: AssetItem[], edits: Map<string, AssetEdit>) {
  const cat = CATEGORIES.find((c) => c.kind === kind)!;
  const lines = [`# ${cat.label} from my saved reels`, '', `${items.length} ${items.length === 1 ? cat.one : `${cat.one}s`}, exported ${new Date().toLocaleDateString()} from ReelMind.`, ''];
  if (kind === 'tool') {
    for (const t of items) lines.push(`- **${t.url ? `[${t.title}](${t.url})` : t.title}**: ${t.subtitle}`);
    return lines.join('\n') + '\n';
  }
  for (const it of items) {
    const body = contentOf(it, edits);
    lines.push(`## ${it.title}`, '');
    if (it.subtitle) lines.push(`_${it.subtitle}_`, '');
    const fence = body.includes('```') ? '````' : '```';
    if (kind === 'workflow') lines.push(body.replace(/^# .*\n+/, ''));
    else lines.push(fence + (kind === 'skill' ? 'markdown' : kind === 'snippet' ? it.language : 'text'), body.trimEnd(), fence);
    lines.push('', `From: [${it.sources[0].title}](${it.sources[0].url})${it.sources[0].creator ? ` by @${it.sources[0].creator}` : ''}`, '');
  }
  return lines.join('\n');
}

/** Files for a zip: skills as folder/SKILL.md, code as files, the rest as Markdown. Names never clash. */
export function zipEntries(items: AssetItem[], edits: Map<string, AssetEdit>) {
  const used = new Set<string>();
  const unique = (path: string) => {
    if (!used.has(path)) return used.add(path), path;
    const dot = path.lastIndexOf('.');
    for (let i = 2; ; i++) {
      const p = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}-${i}${path.slice(dot)}` : `${path}-${i}`;
      if (!used.has(p)) return used.add(p), p;
    }
  };
  return items.map((it) => {
    const content = contentOf(it, edits);
    if (it.kind === 'skill') {
      const folder = unique(skillNameOf(content, it.title));
      return { path: `${folder}/SKILL.md`, content };
    }
    return { path: unique(fileNameOf(it)), content };
  });
}

export function toolsCsv(items: AssetItem[]) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['Tool,Link,What it is for,Reels', ...items.map((t) => [t.title, t.url || '', t.subtitle.replace(/ · in \d+ reels$/, ''), t.sources.map((s) => s.url).join(' ')].map(q).join(','))].join('\n');
}
