import { describe, expect, it } from 'vitest';
import { applyDeltas, History, nextDeltas, type Placed } from './layout';

const nodes: Placed[] = [
  { id: 'section:git', kind: 'section', x: 0, y: 0, members: ['hub:git', 'r1', 'r2'] },
  { id: 'hub:git', kind: 'hub', x: 10, y: 10 },
  { id: 'r1', kind: 'reel', x: 100, y: 10 },
  { id: 'r2', kind: 'reel', x: 100, y: 200 },
  { id: 'root', kind: 'root', x: -300, y: 0 },
];

describe('layout', () => {
  it('moves a topic with everything on it, including reels added later', () => {
    const out = applyDeltas(nodes, { 'section:git': { dx: 50, dy: -20 }, 'hub:git': { dx: 50, dy: -20 }, r1: { dx: 50, dy: -20 } });
    expect(out.find((n) => n.id === 'r2')).toMatchObject({ x: 150, y: 180 });
    expect(out.find((n) => n.id === 'root')).toMatchObject({ x: -300, y: 0 });
  });
  it('a node moved on its own keeps its own offset', () => {
    const out = applyDeltas(nodes, { 'section:git': { dx: 50, dy: 0 }, r1: { dx: 0, dy: 0 } });
    expect(out.find((n) => n.id === 'r1')).toMatchObject({ x: 100, y: 10 });
    expect(out.find((n) => n.id === 'r2')).toMatchObject({ x: 150, y: 200 });
  });
  it('records offsets from the automatic spot', () => {
    const auto = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    expect(nextDeltas({}, new Map([['r1', { x: 130.4, y: 0 }]]), auto)).toEqual({ r1: { dx: 30, dy: -10 } });
  });
  it('undoes and redoes', () => {
    const h = new History();
    h.push({});
    const a = { r1: { dx: 1, dy: 1 } };
    expect(h.undo(a)).toEqual({});
    expect(h.canRedo).toBe(true);
    expect(h.redo({})).toEqual(a);
    expect(h.redo(a)).toBeNull();
  });
});
