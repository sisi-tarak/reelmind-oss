// Your own arrangement of the board, stored as how far each node moved from its automatic spot.
// Storing offsets (not absolute positions) means new reels still land in the right place,
// and a reel added to a topic you moved follows its topic.
import type { Layout } from './types';

export type Deltas = Layout['deltas'];
export interface Placed {
  id: string;
  x: number;
  y: number;
  kind: string;
  members?: string[];
}

/** Section each node belongs to, so a node without its own offset follows its topic. */
export function sectionIndex(nodes: Placed[]) {
  const of = new Map<string, string>();
  for (const n of nodes) if (n.kind === 'section') for (const m of n.members || []) of.set(m, n.id);
  return of;
}

export function applyDeltas<T extends Placed>(nodes: T[], deltas: Deltas): T[] {
  if (!Object.keys(deltas).length) return nodes;
  const of = sectionIndex(nodes);
  return nodes.map((n) => {
    const d = deltas[n.id] || deltas[of.get(n.id) || ''];
    return d ? { ...n, x: n.x + d.dx, y: n.y + d.dy } : n;
  });
}

/** Offsets after a drag: `moved` maps node id to its new absolute position; `auto` gives automatic positions. */
export function nextDeltas(current: Deltas, moved: Map<string, { x: number; y: number }>, auto: Map<string, { x: number; y: number }>): Deltas {
  const out: Deltas = { ...current };
  for (const [id, pos] of moved) {
    const a = auto.get(id);
    if (!a) continue;
    const dx = Math.round(pos.x - a.x);
    const dy = Math.round(pos.y - a.y);
    if (dx === 0 && dy === 0) out[id] = { dx: 0, dy: 0 };
    else out[id] = { dx, dy };
  }
  return out;
}

/** Undo and redo over whole layouts. */
export class History {
  private past: Deltas[] = [];
  private future: Deltas[] = [];
  constructor(private limit = 100) {}
  push(before: Deltas) {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: Deltas): Deltas | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }
  redo(current: Deltas): Deltas | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
