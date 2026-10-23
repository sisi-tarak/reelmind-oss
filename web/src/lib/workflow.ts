// Turns analyzed reels into a workflow-style graph, laid out left to right like an automation editor:
//
//   Saved reels ──► Topic ──► reel ──► reel ──► tool
//                         └─► reel ┄┄┄► related reel in another topic
//
// Each topic sits on its own sticky note. Tools used in more than one topic move to a shared column
// on the right, so one tool node links every reel that uses it.
// Pure function: no React, no storage, easy to test.
import { computeLinks } from './links';
import type { Analysis, Link, Reel } from './types';

export interface WorkflowItem {
  reel: Reel;
  analysis: Analysis;
}

export type WNodeKind = 'root' | 'section' | 'hub' | 'reel' | 'tool';

export interface WNode {
  id: string;
  kind: WNodeKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data: Record<string, unknown>;
}

export type WEdgeKind = 'feeds' | 'teaches' | 'uses' | 'related';

export interface WEdge {
  id: string;
  kind: WEdgeKind;
  source: string;
  target: string;
  label?: string;
  /** Content type of the reel the wire leads to, for colour. */
  contentType?: string;
}

export const SIZE = {
  root: { w: 220, h: 72 },
  hub: { w: 210, h: 64 },
  reel: { w: 180, h: 132, tile: 76 },
  tool: { w: 150, h: 92, dot: 52 },
};

const PAD = 32;
const HEADER = 104;
const REEL_ROW = 152;
const REEL_COL = 216;
const TOOL_ROW = 100;
const MAX_ROWS = 5;
const MAX_TOOLS_PER_REEL = 3;
const SECTION_GAP = 64;
const ROOT_GAP = 140;
const MAX_RELATED_PER_REEL = 2;

const toolKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function dominant(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'other';
}

export function buildWorkflow(items: WorkflowItem[], links?: Link[]): { nodes: WNode[]; edges: WEdge[] } {
  const nodes: WNode[] = [];
  const edges: WEdge[] = [];
  if (!items.length) return { nodes, edges };

  // 1. Group into topics, biggest first; newest reel first inside each.
  const groups = new Map<string, WorkflowItem[]>();
  for (const it of items) {
    const key = it.analysis.primaryTopic || 'unsorted';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const sections = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([topic, list]) => ({
      topic,
      list: list.sort((a, b) => (b.reel.savedAt || b.analysis.analyzedAt).localeCompare(a.reel.savedAt || a.analysis.analyzedAt)),
    }));
  const sectionOf = new Map<string, string>();
  for (const s of sections) for (const it of s.list) sectionOf.set(it.reel.shortcode, s.topic);

  // 2. Tools: shared across topics, or local to one topic.
  const tools = new Map<string, { name: string; kind: string; url: string; reels: string[]; topics: Set<string> }>();
  for (const s of sections) {
    for (const it of s.list) {
      for (const t of it.analysis.tools.slice(0, MAX_TOOLS_PER_REEL)) {
        const key = toolKey(t.name);
        if (!key) continue;
        if (!tools.has(key)) tools.set(key, { name: t.name, kind: t.kind, url: t.url, reels: [], topics: new Set() });
        const entry = tools.get(key)!;
        if (!entry.reels.includes(it.reel.shortcode)) entry.reels.push(it.reel.shortcode);
        entry.topics.add(s.topic);
      }
    }
  }
  const localTools = new Map<string, string[]>();
  for (const [key, t] of tools) {
    if (t.topics.size === 1) {
      const topic = [...t.topics][0];
      if (!localTools.has(topic)) localTools.set(topic, []);
      localTools.get(topic)!.push(key);
    }
  }

  // 3. Measure each topic section.
  const measured = sections.map((s) => {
    const n = s.list.length;
    const rows = Math.min(n, MAX_ROWS);
    const cols = Math.ceil(n / MAX_ROWS);
    const own = localTools.get(s.topic) || [];
    const reelsH = rows * REEL_ROW - (REEL_ROW - SIZE.reel.h);
    const toolsH = own.length ? own.length * TOOL_ROW - (TOOL_ROW - SIZE.tool.h) : 0;
    const contentH = Math.max(reelsH, toolsH, SIZE.hub.h);
    const reelsX = PAD + SIZE.hub.w + 96;
    const reelsRight = reelsX + (cols - 1) * REEL_COL + SIZE.reel.w;
    const toolsX = reelsRight + 96;
    const width = (own.length ? toolsX + SIZE.tool.w : reelsRight) + PAD;
    return { ...s, rows, cols, own, reelsH, toolsH, contentH, reelsX, toolsX, width: Math.max(width, 560), height: HEADER + contentH + PAD };
  });

  // 4. Stack sections in one column, or two balanced columns when there are many.
  const columns = measured.length > 3 ? 2 : 1;
  const colHeights = new Array(columns).fill(0);
  const colWidths = new Array(columns).fill(0);
  const placement = measured.map((m) => {
    const col = colHeights.indexOf(Math.min(...colHeights));
    const y = colHeights[col];
    colHeights[col] += m.height + SECTION_GAP;
    colWidths[col] = Math.max(colWidths[col], m.width);
    return { col, y };
  });
  const sectionsX0 = SIZE.root.w + ROOT_GAP;
  const colX = colWidths.map((_, i) => sectionsX0 + colWidths.slice(0, i).reduce((a, w) => a + w + SECTION_GAP * 1.5, 0));
  const totalH = Math.max(...colHeights) - SECTION_GAP;

  nodes.push({ id: 'root', kind: 'root', x: 0, y: totalH / 2 - SIZE.root.h / 2, data: { count: items.length, topics: sections.length } });

  const reelPos = new Map<string, { x: number; y: number }>();
  measured.forEach((m, i) => {
    const sx = colX[placement[i].col];
    const sy = placement[i].y;
    const sectionId = `section:${m.topic}`;
    const types = m.list.map((it) => it.analysis.contentType);
    const mood = dominant(types);
    const saved = m.list.map((it) => it.reel.savedAt).filter(Boolean).sort() as string[];
    nodes.push({
      id: sectionId,
      kind: 'section',
      x: sx,
      y: sy,
      width: m.width,
      height: m.height,
      data: {
        topic: m.topic,
        count: m.list.length,
        contentType: mood,
        firstSaved: saved[0] || null,
        lastSaved: saved[saved.length - 1] || null,
        practised: m.list.filter((it) => it.reel.practiceDone).length,
        // Everything drawn on this sticky note; moving the note moves these too.
        members: [`hub:${m.topic}`, ...m.list.map((it) => it.reel.shortcode), ...m.own.map((key) => `tool:${key}`)],
      },
    });

    const hubId = `hub:${m.topic}`;
    nodes.push({ id: hubId, kind: 'hub', x: sx + PAD, y: sy + HEADER + m.contentH / 2 - SIZE.hub.h / 2, data: { topic: m.topic, count: m.list.length, contentType: mood } });
    edges.push({ id: `e:root:${hubId}`, kind: 'feeds', source: 'root', target: hubId, label: `${m.list.length} ${m.list.length === 1 ? 'reel' : 'reels'}` });

    const reelsTop = sy + HEADER + (m.contentH - m.reelsH) / 2;
    m.list.forEach((it, j) => {
      const x = sx + m.reelsX + Math.floor(j / MAX_ROWS) * REEL_COL;
      const y = reelsTop + (j % MAX_ROWS) * REEL_ROW;
      reelPos.set(it.reel.shortcode, { x, y });
      nodes.push({ id: it.reel.shortcode, kind: 'reel', x, y, data: { shortcode: it.reel.shortcode } });
      edges.push({ id: `e:${hubId}:${it.reel.shortcode}`, kind: 'teaches', source: hubId, target: it.reel.shortcode, contentType: it.analysis.contentType });
    });

    const toolsTop = sy + HEADER + (m.contentH - m.toolsH) / 2;
    m.own.forEach((key, j) => {
      const t = tools.get(key)!;
      nodes.push({ id: `tool:${key}`, kind: 'tool', x: sx + m.toolsX, y: toolsTop + j * TOOL_ROW, data: { name: t.name, kind: t.kind, url: t.url, uses: t.reels.length, shared: false } });
    });
  });

  // 5. Shared tools: a column to the right, each next to the reels that use it.
  const rightEdge = Math.max(...measured.map((m, i) => colX[placement[i].col] + m.width));
  const shared = [...tools.entries()]
    .filter(([, t]) => t.topics.size > 1)
    .map(([key, t]) => {
      const ys = t.reels.map((id) => reelPos.get(id)!.y);
      return { key, t, want: ys.reduce((a, b) => a + b, 0) / ys.length };
    })
    .sort((a, b) => a.want - b.want);
  let lastY = -Infinity;
  for (const s of shared) {
    const y = Math.max(s.want, lastY + TOOL_ROW + 12);
    lastY = y;
    nodes.push({ id: `tool:${s.key}`, kind: 'tool', x: rightEdge + 160, y, data: { name: s.t.name, kind: s.t.kind, url: s.t.url, uses: s.t.reels.length, shared: true } });
  }

  for (const [key, t] of tools) {
    for (const id of t.reels) edges.push({ id: `e:${id}:tool:${key}`, kind: 'uses', source: id, target: `tool:${key}` });
  }

  // 6. Related reels in different topics (reels in one topic are already joined by their topic node).
  //    Strongest links first, at most a couple per reel so the board stays readable.
  const related = (links ?? computeLinks(items.map((i) => i.analysis), new Map())).filter(
    (l) => reelPos.has(l.a) && reelPos.has(l.b) && sectionOf.get(l.a) !== sectionOf.get(l.b),
  );
  const degree = new Map<string, number>();
  for (const c of [...related].sort((x, y) => y.score - x.score)) {
    if ((degree.get(c.a) || 0) >= MAX_RELATED_PER_REEL || (degree.get(c.b) || 0) >= MAX_RELATED_PER_REEL) continue;
    degree.set(c.a, (degree.get(c.a) || 0) + 1);
    degree.set(c.b, (degree.get(c.b) || 0) + 1);
    // Wire runs downward: from the reel higher on the board to the lower one.
    const [top, bottom] = reelPos.get(c.a)!.y <= reelPos.get(c.b)!.y ? [c.a, c.b] : [c.b, c.a];
    edges.push({ id: `e:rel:${top}:${bottom}`, kind: 'related', source: top, target: bottom, label: c.reason });
  }

  return { nodes, edges };
}

/** Everything one click away from a node, so the rest of the board can fade back. */
export function neighbourhood(id: string, edges: WEdge[]): Set<string> {
  const keep = new Set([id]);
  for (const e of edges) {
    if (e.source === id) keep.add(e.target);
    if (e.target === id) keep.add(e.source);
  }
  // A topic also shows the tools its reels use; a tool also shows its reels' topics.
  const first = new Set(keep);
  for (const e of edges) {
    if (id.startsWith('hub:') && e.kind === 'uses' && first.has(e.source)) keep.add(e.target);
    if (id.startsWith('tool:') && e.kind === 'teaches' && first.has(e.target)) keep.add(e.source);
  }
  return keep;
}
