// The board as a 3D knowledge graph you can rotate and zoom. Loaded only when you switch to it.
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import SpriteText from 'three-spritetext';
import { Pause, Play, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { registerCapture } from '@/lib/capture';
import { moodFor, STATE } from '@/lib/emotion';
import { topicLabel } from '@/lib/topics';
import type { Link } from '@/lib/types';
import type { CanvasItem } from './canvas';

type GNode = { id: string; kind: 'root' | 'topic' | 'reel' | 'tool'; label: string; color: string; val: number; topic?: string };
type GLink = { source: string; target: string; kind: 'feeds' | 'teaches' | 'uses' | 'related'; color: string };

const DIM = '#dfe3e9';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function dominant(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
}

export default function Graph3D({
  items,
  links,
  match,
  onOpen,
  onOpenTopic,
}: {
  items: CanvasItem[];
  links: Link[];
  match: Set<string> | null;
  onOpen: (id: string) => void;
  onOpenTopic: (topic: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraph3DInstance | null>(null);
  const [spinning, setSpinning] = useState(false);
  const handlers = useRef({ onOpen, onOpenTopic });
  handlers.current = { onOpen, onOpenTopic };

  const data = useMemo(() => {
    const nodes: GNode[] = [];
    const glinks: GLink[] = [];
    const byTopic = new Map<string, CanvasItem[]>();
    for (const it of items) {
      const t = it.analysis.primaryTopic || 'unsorted';
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(it);
    }
    // One centre node ties every topic together, like "Saved reels" on the workflow board.
    nodes.push({ id: 'root', kind: 'root', label: `Saved reels (${items.length})`, color: '#1f2430', val: 18 });
    for (const [topic, list] of byTopic) {
      const mood = moodFor(dominant(list.map((i) => i.analysis.contentType)));
      nodes.push({ id: `topic:${topic}`, kind: 'topic', label: topicLabel(topic), color: mood.color, val: 10 + list.length * 2, topic });
      glinks.push({ source: 'root', target: `topic:${topic}`, kind: 'feeds', color: '#b4bac4' });
    }
    const tools = new Map<string, GNode>();
    for (const it of items) {
      const mood = moodFor(it.analysis.contentType);
      nodes.push({ id: it.reel.shortcode, kind: 'reel', label: it.analysis.title, color: mood.color, val: 4 });
      glinks.push({ source: `topic:${it.analysis.primaryTopic || 'unsorted'}`, target: it.reel.shortcode, kind: 'teaches', color: mood.color });
      for (const t of it.analysis.tools.slice(0, 3)) {
        const key = `tool:${t.name.trim().toLowerCase()}`;
        if (!tools.has(key)) tools.set(key, { id: key, kind: 'tool', label: t.name, color: STATE.tool.color, val: 1.2 });
        glinks.push({ source: it.reel.shortcode, target: key, kind: 'uses', color: '#c4c9d1' });
      }
    }
    nodes.push(...tools.values());
    const ids = new Set(nodes.map((n) => n.id));
    for (const l of links) if (ids.has(l.a) && ids.has(l.b)) glinks.push({ source: l.a, target: l.b, kind: 'related', color: STATE.related.color });
    return { nodes, links: glinks };
  }, [items, links]);

  // Which nodes stay bright under the current search or filter.
  const keep = useMemo(() => {
    if (!match) return null;
    const k = new Set<string>(['root', ...match]);
    for (const l of data.links) {
      const s = typeof l.source === 'string' ? l.source : (l.source as GNode).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as GNode).id;
      if (l.kind === 'teaches' && match.has(t)) k.add(s);
      if (l.kind === 'feeds') continue;
      if (l.kind === 'uses' && match.has(s)) k.add(t);
    }
    return k;
  }, [match, data.links]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const g = new ForceGraph3D(el, { controlType: 'orbit', rendererConfig: { preserveDrawingBuffer: true, antialias: true } })
      .backgroundColor('#f4f5f7')
      .showNavInfo(false)
      .nodeRelSize(4)
      .nodeOpacity(0.95)
      .linkOpacity(0.55)
      .linkWidth((l: object) => ((l as GLink).kind === 'related' ? 1.2 : (l as GLink).kind === 'teaches' || (l as GLink).kind === 'feeds' ? 0.8 : 0.3))
      .nodeLabel((n: object) => {
        const node = n as GNode;
        const kind = node.kind === 'topic' ? 'Topic' : node.kind === 'tool' ? 'Tool' : node.kind === 'root' ? 'Start' : 'Reel';
        return `<div style="font:13px 'Schibsted Grotesk Variable',sans-serif;background:#fff;color:#1f2430;border:1px solid #e1e4e9;border-radius:8px;padding:6px 10px;max-width:260px;box-shadow:0 6px 18px -8px rgba(16,24,40,.35)"><span style="color:${node.color};font-weight:600">${kind}</span><br/>${esc(node.label)}</div>`;
      })
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n: object) => {
        const node = n as GNode;
        if (node.kind !== 'topic' && node.kind !== 'root') return undefined as unknown as never;
        const label = new SpriteText(node.label, node.kind === 'root' ? 9 : 8, '#1f2430');
        label.fontWeight = '600';
        label.backgroundColor = 'rgba(255,255,255,0.85)';
        label.padding = 2;
        label.borderRadius = 3;
        label.position.y = node.kind === 'root' ? 20 : 16;
        return label;
      })
      .onNodeClick((n: object) => {
        const node = n as GNode;
        if (node.kind === 'reel') handlers.current.onOpen(node.id);
        if (node.kind === 'topic' && node.topic) handlers.current.onOpenTopic(node.topic);
      })
      .cooldownTicks(160)
      .onEngineStop(() => g.zoomToFit(600, 20));
    graph.current = g;

    const fit = () => g.width(el.clientWidth).height(el.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    registerCapture(async ({ format }) => {
      g.renderer().render(g.scene(), g.camera());
      return g.renderer().domElement.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
    });

    return () => {
      registerCapture(null);
      ro.disconnect();
      g._destructor();
      el.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    g.graphData(data);
    // Frame everything once the layout has had a moment to settle.
    const t = setTimeout(() => g.zoomToFit(800, 20), 2500);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    g.nodeColor((n: object) => (keep && !keep.has((n as GNode).id) ? DIM : (n as GNode).color));
    g.linkColor((l: object) => {
      const link = l as { source: GNode | string; target: GNode | string; color: string };
      const s = typeof link.source === 'string' ? link.source : link.source.id;
      const t = typeof link.target === 'string' ? link.target : link.target.id;
      return keep && !(keep.has(s) && keep.has(t)) ? DIM : link.color;
    });
  }, [keep, data]);

  useEffect(() => {
    const controls = graph.current?.controls() as { autoRotate?: boolean; autoRotateSpeed?: number } | undefined;
    if (!controls) return;
    controls.autoRotate = spinning;
    controls.autoRotateSpeed = 1.2;
  }, [spinning]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" aria-label="3D view of your reels" role="img" />
      <div className="absolute bottom-4 left-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setSpinning((v) => !v)}>
          {spinning ? <Pause /> : <Play />} {spinning ? 'Stop rotating' : 'Rotate'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => graph.current?.zoomToFit(600, 40)}>
          <Scan /> Fit
        </Button>
      </div>
      <p className="pointer-events-none absolute bottom-5 right-4 rounded-md bg-background/80 px-2 py-1 text-[12px] text-muted-foreground">Drag to rotate, scroll to zoom, click a sphere to open it</p>
    </div>
  );
}
