import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  getViewportForBounds,
  useNodesState,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, LayoutGrid, Maximize, Minus, MousePointer2, Move, Plus, Redo2, Undo2 } from 'lucide-react';
import { db } from '@/lib/db';
import { applyDeltas, History, nextDeltas, type Deltas } from '@/lib/layout';
import { CONTENT_MOODS, moodFor, RootIcon, STATE, TOOL_ICONS, type Mood } from '@/lib/emotion';
import { topicLabel } from '@/lib/topics';
import type { Analysis, Link, Reel } from '@/lib/types';
import { cn, formatDate, plural } from '@/lib/utils';
import { buildWorkflow, neighbourhood, SIZE, type WEdge, type WNode } from '@/lib/workflow';
import { registerCapture } from '@/lib/capture';
import { ReelHoverCard } from './reel-hover';

// Lets nodes open notes and know the board mode without putting functions in node data.
const BoardContext = createContext<{ open: (id: string) => void; editing: boolean }>({ open: () => {}, editing: false });

/** Shows after a short pause and stays while the pointer is on the tile or the card. */
function useHover(delay = 380) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => clear, []);
  const enter = () => {
    clear();
    timer.current = setTimeout(() => setShown(true), shown ? 0 : delay);
  };
  const leave = () => {
    clear();
    timer.current = setTimeout(() => setShown(false), 180);
  };
  const hide = () => {
    clear();
    setShown(false);
  };
  return { shown, enter, leave, hide };
}

export interface CanvasItem {
  reel: Reel;
  analysis: Analysis;
}

const hidden = '!opacity-0 !pointer-events-none';

// ── Nodes ────────────────────────────────────────────────────────────────

type RootData = { count: number; topics: number };
const RootNode = memo(function RootNode({ data }: NodeProps<Node<RootData>>) {
  return (
    <div className="flex items-center gap-3 rounded-l-[36px] rounded-r-xl border-[1.5px] border-foreground/70 bg-background px-3 shadow-[0_1px_2px_rgb(16_24_40/0.06)]" style={{ width: SIZE.root.w, height: SIZE.root.h }}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-highlight">
        <RootIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-tight">Saved reels</p>
        <p className="text-[12px] text-muted-foreground">
          {plural(data.count, 'reel')} in {plural(data.topics, 'topic')}
        </p>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

type SectionData = { topic: string; count: number; contentType: string; firstSaved: string | null; lastSaved: string | null; practised: number };
const SectionNode = memo(function SectionNode({ data, width, height }: NodeProps<Node<SectionData>>) {
  const mood = moodFor(data.contentType);
  const range =
    data.firstSaved && data.lastSaved
      ? data.firstSaved.slice(0, 10) === data.lastSaved.slice(0, 10)
        ? `Saved ${formatDate(data.firstSaved)}`
        : `Saved ${formatDate(data.firstSaved)} to ${formatDate(data.lastSaved)}`
      : null;
  return (
    <div className="rounded-xl border px-5 pt-4" style={{ width, height, background: mood.tint, borderColor: mood.edge }}>
      <p className="text-[17px] font-semibold tracking-[-0.01em]">{topicLabel(data.topic)}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        {plural(data.count, 'reel')}, mostly <span style={{ color: mood.color }} className="font-medium">{mood.label.toLowerCase()}</span>
        {range ? `. ${range}.` : '.'}
      </p>
      <p className="text-[12.5px] leading-snug text-muted-foreground">
        {data.practised ? `Practised ${data.practised} of ${data.count}.` : 'No practice tasks done yet.'}
      </p>
    </div>
  );
});

type HubData = { topic: string; count: number; contentType: string };
const HubNode = memo(function HubNode({ data }: NodeProps<Node<HubData>>) {
  const mood = moodFor(data.contentType);
  const Icon = mood.icon;
  return (
    <div className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] bg-background px-3 shadow-[0_1px_2px_rgb(16_24_40/0.06)]" style={{ width: SIZE.hub.w, height: SIZE.hub.h, borderColor: mood.color }}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: mood.color }}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold leading-tight">{topicLabel(data.topic)}</p>
        <p className="text-[12px] text-muted-foreground">Topic, {plural(data.count, 'reel')}</p>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

type ReelData = { item: CanvasItem; isNew: boolean };
const DIFFICULTY: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

const ReelNode = memo(function ReelNode({ id, data, dragging }: NodeProps<Node<ReelData>>) {
  const { reel, analysis } = data.item;
  const { open, editing } = useContext(BoardContext);
  const hover = useHover();
  const mood = moodFor(analysis.contentType);
  const Icon = mood.icon;
  const level = DIFFICULTY[analysis.difficulty] || 1;
  return (
    <div className="relative flex cursor-pointer flex-col items-center" style={{ width: SIZE.reel.w, height: SIZE.reel.h }} onMouseEnter={hover.enter} onMouseLeave={hover.leave} onMouseDown={hover.hide}>
      <NodeToolbar isVisible={hover.shown && !dragging && !editing} position={Position.Top} offset={10} className="hover-card">
        <div onMouseEnter={hover.enter} onMouseLeave={hover.leave}>
          <ReelHoverCard
            reel={reel}
            analysis={analysis}
            onOpen={() => {
              hover.hide();
              open(id);
            }}
          />
        </div>
      </NodeToolbar>
      <div
        className="reel-tile relative flex items-center justify-center rounded-2xl border-[1.5px] shadow-[0_1px_2px_rgb(16_24_40/0.06)] transition-shadow hover:shadow-[0_6px_18px_-8px_rgb(16_24_40/0.35)]"
        style={{ width: SIZE.reel.tile, height: SIZE.reel.tile, background: mood.tint, borderColor: mood.color }}
        data-new={data.isNew}
      >
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <Handle type="source" position={Position.Right} isConnectable={false} />
        <Handle id="rel-in" type="target" position={Position.Top} isConnectable={false} className={hidden} />
        <Icon className="size-8" style={{ color: mood.color }} strokeWidth={1.75} />
        {data.isNew && <span className="absolute -left-1.5 -top-1.5 size-3.5 rounded-full border-2 border-background" style={{ background: STATE.new.color }} title={STATE.new.label} />}
        {reel.practiceDone && (
          <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border-2 border-background text-white" style={{ background: STATE.done.color }} title={STATE.done.label}>
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
        )}
        <span className="absolute bottom-1.5 right-2 flex items-end gap-[2px]" title={analysis.difficulty} aria-label={`Difficulty: ${analysis.difficulty}`}>
          {[1, 2, 3].map((b) => (
            <span key={b} className="w-[3px] rounded-full" style={{ height: 3 + b * 2, background: mood.color, opacity: b <= level ? 0.9 : 0.2 }} />
          ))}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 px-1 text-center text-[12.5px] font-semibold leading-[1.25]">{analysis.title}</p>
      <p className="max-w-full truncate text-[11.5px] text-muted-foreground">{reel.creator ? `@${reel.creator}` : mood.label}</p>
      <Handle id="rel-out" type="source" position={Position.Bottom} isConnectable={false} className={hidden} />
    </div>
  );
});

type ToolData = { name: string; kind: string; url: string; uses: number; shared: boolean };
const ToolNode = memo(function ToolNode({ data }: NodeProps<Node<ToolData>>) {
  const Icon = TOOL_ICONS[data.kind] || TOOL_ICONS.other;
  return (
    <div className="flex cursor-pointer flex-col items-center" style={{ width: SIZE.tool.w, height: SIZE.tool.h }}>
      <div className="relative flex items-center justify-center rounded-full border-[1.5px] border-dashed bg-background" style={{ width: SIZE.tool.dot, height: SIZE.tool.dot, borderColor: STATE.tool.color }}>
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <Icon className="size-5 text-muted-foreground" />
        {data.uses > 1 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10.5px] font-semibold text-background" title={`Used in ${data.uses} reels`}>
            {data.uses}
          </span>
        )}
      </div>
      <p className="mt-1.5 max-w-full truncate text-[12px] font-medium">{data.name}</p>
      <p className="text-[11px] text-muted-foreground">{data.shared ? `Shared ${data.kind}` : data.kind}</p>
    </div>
  );
});

const nodeTypes = { root: RootNode, section: SectionNode, hub: HubNode, reel: ReelNode, tool: ToolNode };

// ── Edges ────────────────────────────────────────────────────────────────

function toEdge(e: WEdge, dim: boolean): Edge {
  const base = { id: e.id, source: e.source, target: e.target, className: dim ? 'dimmed' : undefined, focusable: false, selectable: false };
  const arrow = (color: string) => ({ type: MarkerType.ArrowClosed, color, width: 14, height: 14 });
  const labelStyle = { fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'inherit' };
  switch (e.kind) {
    case 'feeds':
      return { ...base, label: e.label, labelStyle, labelBgPadding: [4, 2], labelBgStyle: { fill: '#f4f5f7' }, style: { stroke: 'var(--wire)', strokeWidth: 1.5 }, markerEnd: arrow('#b4bac4') };
    case 'teaches': {
      const color = moodFor(e.contentType).color;
      return { ...base, style: { stroke: color, strokeWidth: 1.75, opacity: 0.75 }, markerEnd: arrow(color) };
    }
    case 'uses':
      return { ...base, style: { stroke: STATE.tool.color, strokeWidth: 1.25, strokeDasharray: '5 4' } };
    case 'related':
      return {
        ...base,
        sourceHandle: 'rel-out',
        targetHandle: 'rel-in',
        label: e.label,
        labelStyle: { ...labelStyle, fill: STATE.related.color, fontWeight: 600 },
        labelBgPadding: [4, 2],
        labelBgStyle: { fill: '#f4f5f7' },
        style: { stroke: STATE.related.color, strokeWidth: 1.5, strokeDasharray: '2 5', strokeLinecap: 'round' },
        markerEnd: arrow(STATE.related.color),
      };
  }
}

// ── Legend ───────────────────────────────────────────────────────────────

function Swatch({ mood }: { mood: Mood }) {
  const Icon = mood.icon;
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-[1.5px]" style={{ background: mood.tint, borderColor: mood.color }}>
      <Icon className="size-3.5" style={{ color: mood.color }} />
    </span>
  );
}

function Legend({ used }: { used: Set<string> }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('reelmind.legend') === 'open';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem('reelmind.legend', v ? 'closed' : 'open');
      } catch {
        /* preference just won't persist */
      }
      return !v;
    });
  };
  const moods = Object.entries(CONTENT_MOODS).filter(([key]) => used.has(key));
  return (
    <div className={cn('rounded-xl border bg-background/95 text-[12.5px] shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)] backdrop-blur', open ? 'w-[280px]' : 'w-auto')}>
      <button onClick={toggle} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-semibold" aria-expanded={open}>
        <span className="flex items-center gap-2">
          {!open && (
            <span className="flex -space-x-1" aria-hidden>
              {moods.map(([key, mood]) => (
                <span key={key} className="size-3 rounded-full border-2 border-background" style={{ background: mood.color }} />
              ))}
            </span>
          )}
          What the colours mean
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 border-t px-3.5 pb-3.5 pt-3">
          {moods.map(([key, mood]) => (
            <div key={key} className="flex items-start gap-2.5">
              <Swatch mood={mood} />
              <p className="leading-snug">
                <span className="font-semibold" style={{ color: mood.color }}>
                  {mood.label}.
                </span>{' '}
                <span className="text-muted-foreground">{mood.feeling}</span>
              </p>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-2 border-t pt-3">
            <p className="flex items-center gap-2.5">
              <span className="ml-1.5 size-3 rounded-full" style={{ background: STATE.new.color }} />
              <span className="ml-1">{STATE.new.label}</span>
            </p>
            <p className="flex items-center gap-2.5">
              <span className="ml-1.5 flex size-3 items-center justify-center rounded-full text-white" style={{ background: STATE.done.color }}>
                <Check className="size-2" strokeWidth={4} />
              </span>
              <span className="ml-1">{STATE.done.label}</span>
            </p>
            <p className="flex items-center gap-2.5">
              <svg width="24" height="8" aria-hidden>
                <line x1="1" y1="4" x2="23" y2="4" stroke={STATE.related.color} strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
              </svg>
              {STATE.related.label}
            </p>
            <p className="flex items-center gap-2.5">
              <svg width="24" height="8" aria-hidden>
                <line x1="1" y1="4" x2="23" y2="4" stroke={STATE.tool.color} strokeWidth="1.5" strokeDasharray="5 4" />
              </svg>
              {STATE.tool.label}
            </p>
            <p className="flex items-center gap-2.5">
              <span className="flex items-end gap-[2px] pl-1.5 pr-1">
                {[1, 2, 3].map((b) => (
                  <span key={b} className="w-[3px] rounded-full bg-foreground" style={{ height: 3 + b * 2, opacity: b <= 2 ? 0.8 : 0.2 }} />
                ))}
              </span>
              Difficulty, one to three bars
            </p>
          </div>
          <p className="border-t pt-2.5 text-muted-foreground">Click a topic to open its board, a reel to open its notes, or a tool to see every reel that uses it. Everything not connected fades back. To rearrange the board, press Edit (V) at the bottom, drag anything, and undo with Ctrl+Z.</p>
        </div>
      )}
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────

function toFlowNode(n: WNode, items: Map<string, CanvasItem>, lastBatchId: string | null): Node {
  const common = { id: n.id, type: n.kind, position: { x: n.x, y: n.y } };
  if (n.kind === 'section') {
    return { ...common, data: n.data, width: n.width, height: n.height, zIndex: -1, focusable: false };
  }
  if (n.kind === 'reel') {
    const item = items.get(n.id)!;
    return { ...common, data: { item, isNew: Boolean(lastBatchId && item.reel.batchId === lastBatchId) } satisfies ReelData };
  }
  return { ...common, data: n.data };
}

export interface CanvasProps {
  items: CanvasItem[];
  links: Link[];
  lastBatchId: string | null;
  /** Reels matching the search or filters; everything else fades. null = no filter. */
  match: Set<string> | null;
  /** A node to focus from outside the board, for example a reel picked on the timeline. */
  focusRequest: { id: string; at: number } | null;
  onOpen: (id: string) => void;
  onOpenTopic: (topic: string) => void;
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) || Boolean(document.querySelector('[role="dialog"]'));
};

function Board({ items, links, lastBatchId, match, focusRequest, onOpen, onOpenTopic }: CanvasProps) {
  const byId = useMemo(() => new Map(items.map((i) => [i.reel.shortcode, i])), [items]);
  const graph = useMemo(() => buildWorkflow(items, links), [items, links]);
  const [focus, setFocus] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const editing = mode === 'edit';
  const near = useMemo(() => (focus ? neighbourhood(focus, graph.edges) : null), [focus, graph.edges]);
  // Filter matches keep their topic, their tools and the start node visible too.
  const kept = useMemo(() => {
    if (!match) return null;
    const keep = new Set<string>(['root', ...match]);
    for (const e of graph.edges) {
      if (e.kind === 'teaches' && match.has(e.target)) keep.add(e.source);
      if (e.kind === 'uses' && match.has(e.source)) keep.add(e.target);
    }
    return keep;
  }, [match, graph.edges]);
  // A new search or filter starts from the whole board, not from an old click.
  useEffect(() => setFocus(null), [match]);
  const visible = (id: string) => (!near || near.has(id)) && (!kept || kept.has(id));

  // Your arrangement: offsets from the automatic layout, saved in this browser (and synced, if on).
  const saved = useLiveQuery(() => db.layouts.get('board'), []);
  const deltas = useMemo(() => saved?.deltas || {}, [saved]);
  const history = useRef(new History());
  const [, bump] = useState(0);
  const auto = useMemo(() => new Map(graph.nodes.map((n) => [n.id, { x: n.x, y: n.y }])), [graph.nodes]);
  const members = useMemo(() => new Map(graph.nodes.filter((n) => n.kind === 'section').map((n) => [n.id, (n.data.members as string[]) || []])), [graph.nodes]);
  const placed = useMemo(() => applyDeltas(graph.nodes, deltas), [graph.nodes, deltas]);
  const laidOut = useMemo(() => placed.map((n) => toFlowNode(n, byId, lastBatchId)), [placed, byId, lastBatchId]);
  const [nodes, setNodes, onNodesChange] = useNodesState(laidOut);
  const { fitView, getNodes, getNodesBounds, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const wrapper = useRef<HTMLDivElement>(null);
  const dragStart = useRef<Map<string, { x: number; y: number }> | null>(null);

  const saveLayout = async (next: Deltas) => {
    await db.layouts.put({ id: 'board', deltas: next, updatedAt: new Date().toISOString() });
  };
  const commit = async (next: Deltas) => {
    history.current.push(deltas);
    bump((n) => n + 1);
    await saveLayout(next);
  };
  const undo = async () => {
    const prev = history.current.undo(deltas);
    bump((n) => n + 1);
    if (prev) await saveLayout(prev);
  };
  const redo = async () => {
    const next = history.current.redo(deltas);
    bump((n) => n + 1);
    if (next) await saveLayout(next);
  };
  const resetLayout = () => Object.keys(deltas).length && commit({});

  useEffect(() => {
    setNodes(laidOut);
  }, [laidOut, setNodes]);

  // Figma-style keys: V edit, H view, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && !e.altKey && key === 'v') setMode('edit');
      else if (!mod && !e.altKey && key === 'h') setMode('view');
      else if (key === 'escape' && editing) setMode('view');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Moving a topic note carries everything on it.
  const onNodeDragStart = (_: unknown, _node: Node, dragged: Node[]) => {
    const ids = new Set(dragged.map((n) => n.id));
    for (const n of dragged) if (n.type === 'section') (members.get(n.id) || []).forEach((m) => ids.add(m));
    dragStart.current = new Map(getNodes().filter((n) => ids.has(n.id)).map((n) => [n.id, { ...n.position }]));
  };
  const onNodeDrag = (_: unknown, node: Node, dragged: Node[]) => {
    const start = dragStart.current;
    const origin = start?.get(node.id);
    if (!start || !origin) return;
    const dx = node.position.x - origin.x;
    const dy = node.position.y - origin.y;
    const draggedIds = new Set(dragged.map((n) => n.id));
    setNodes((prev) => prev.map((n) => (draggedIds.has(n.id) || !start.has(n.id) ? n : { ...n, position: { x: start.get(n.id)!.x + dx, y: start.get(n.id)!.y + dy } })));
  };
  const onNodeDragStop = () => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const now = new Map(getNodes().filter((n) => start.has(n.id)).map((n) => [n.id, { ...n.position }]));
    const changed = [...now].some(([id, p]) => Math.abs(p.x - start.get(id)!.x) > 0.5 || Math.abs(p.y - start.get(id)!.y) > 0.5);
    if (changed) commit(nextDeltas(deltas, now, auto));
  };

  // Lets Export and Share take a picture of the board, cropped to the reels they're about.
  useEffect(() => {
    registerCapture(async ({ reelIds, format, clean }) => {
      const root = wrapper.current;
      const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport');
      if (!root || !viewport) throw new Error('The board is not on screen.');
      let ids: Set<string> | null = null;
      if (reelIds && reelIds.size) {
        ids = new Set(reelIds);
        for (const e of graph.edges) {
          if (e.kind === 'teaches' && reelIds.has(e.target)) {
            ids.add(e.source);
            ids.add(`section:${e.source.slice(4)}`);
          }
          if (e.kind === 'uses' && reelIds.has(e.source)) ids.add(e.target);
        }
      }
      const framed = getNodes().filter((n) => !ids || ids.has(n.id));
      const bounds = getNodesBounds(framed);
      const pad = 48;
      const width = Math.ceil(bounds.width + pad * 2);
      const height = Math.ceil(bounds.height + pad * 2);
      const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
      const pixelRatio = Math.min(2, 7000 / Math.max(width, height));
      const { toJpeg, toPng } = await import('html-to-image');
      if (clean) root.classList.add('exporting');
      try {
        const opts = {
          backgroundColor: '#f4f5f7',
          width,
          height,
          pixelRatio,
          style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
        };
        return format === 'jpeg' ? await toJpeg(viewport, { ...opts, quality: 0.92 }) : await toPng(viewport, opts);
      } finally {
        root.classList.remove('exporting');
      }
    });
    return () => registerCapture(null);
  }, [graph.edges, getNodes, getNodesBounds]);

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, className: n.type !== 'section' && !visible(n.id) ? 'dimmed' : undefined })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, kept, laidOut, setNodes]);

  const edges = useMemo(
    () => graph.edges.map((e) => toEdge(e, !(visible(e.source) && visible(e.target)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph.edges, near, kept],
  );

  useEffect(() => {
    if (!focusRequest) return;
    setFocus(focusRequest.id);
    if (getNodes().some((n) => n.id === focusRequest.id)) fitView({ nodes: [{ id: focusRequest.id }], duration: 500, maxZoom: 1.1, padding: 0.6 });
  }, [focusRequest, getNodes, fitView]);
  const usedMoods = useMemo(() => new Set(items.map((i) => i.analysis.contentType || 'other')), [items]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.08, duration: 400, maxZoom: 1 }), 60);
    return () => clearTimeout(t);
  }, [items.length, fitView]);

  const open = (node: Node) => {
    if (node.type === 'reel') onOpen(node.id);
    if (node.type === 'hub') onOpenTopic((node.data as HubData).topic);
  };

  return (
    <BoardContext.Provider value={{ open: onOpen, editing }}>
      <div ref={wrapper} className={cn('h-full w-full', editing ? 'board-edit' : 'board-view')}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (editing) return;
            if (node.type === 'section') return setFocus(null);
            setFocus((cur) => (cur === node.id && node.type === 'tool' ? null : node.id));
            open(node);
          }}
          onNodeDoubleClick={(_, node) => editing && open(node)}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setFocus(null)}
          nodesDraggable={editing}
          nodesConnectable={false}
          elementsSelectable={editing}
          selectionOnDrag={editing}
          panOnDrag={editing ? [1, 2] : true}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          deleteKeyCode={null}
          minZoom={0.1}
          maxZoom={1.75}
          fitView
          fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
          panOnScroll
          zoomOnDoubleClick={!editing}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="var(--canvas-dot)" />
          <Panel position="top-left">
            <Legend used={usedMoods} />
          </Panel>
          <Panel position="bottom-center" className="!mb-3">
            <Toolbar
              mode={mode}
              onMode={setMode}
              zoom={zoom}
              onZoomIn={() => zoomIn({ duration: 200 })}
              onZoomOut={() => zoomOut({ duration: 200 })}
              onFit={() => fitView({ padding: 0.08, duration: 400, maxZoom: 1 })}
              canUndo={history.current.canUndo}
              canRedo={history.current.canRedo}
              onUndo={undo}
              onRedo={redo}
              moved={Object.keys(deltas).length > 0}
              onReset={resetLayout}
            />
          </Panel>
          <MiniMap
            position="bottom-right"
            style={{ marginBottom: 28 }}
            pannable
            zoomable
            nodeColor={(n) => {
              if (n.type === 'section') return moodFor((n.data as SectionData).contentType).tint;
              if (n.type === 'reel') return moodFor((n.data as ReelData).item.analysis.contentType).color;
              if (n.type === 'hub') return moodFor((n.data as HubData).contentType).color;
              return '#98a2b3';
            }}
            maskColor="rgb(244 245 247 / 0.7)"
          />
        </ReactFlow>
      </div>
    </BoardContext.Provider>
  );
}

function ToolButton({ label, keys, active, disabled, onClick, children }: { label: string; keys?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={keys ? `${label} (${keys})` : label}
      className={cn('flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors disabled:opacity-35', active ? 'bg-foreground text-background' : 'hover:bg-muted')}
    >
      {children}
    </button>
  );
}

function Toolbar(p: {
  mode: 'view' | 'edit';
  onMode: (m: 'view' | 'edit') => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  moved: boolean;
  onReset: () => void;
}) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';
  return (
    <div className="flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-[0_8px_24px_-12px_rgb(16_24_40/0.3)] backdrop-blur" role="toolbar" aria-label="Board tools">
      <ToolButton label="View" keys="H" active={p.mode === 'view'} onClick={() => p.onMode('view')}>
        <MousePointer2 className="size-4" /> <span className="hidden sm:inline">View</span>
      </ToolButton>
      <ToolButton label="Edit layout" keys="V" active={p.mode === 'edit'} onClick={() => p.onMode('edit')}>
        <Move className="size-4" /> <span className="hidden sm:inline">Edit</span>
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label="Undo" keys={`${mod}Z`} disabled={!p.canUndo} onClick={p.onUndo}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo" keys={`${mod}Shift+Z`} disabled={!p.canRedo} onClick={p.onRedo}>
        <Redo2 className="size-4" />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label="Zoom out" onClick={p.onZoomOut}>
        <Minus className="size-4" />
      </ToolButton>
      <button onClick={p.onFit} title="Fit the whole board" className="h-8 w-12 rounded-lg text-[12.5px] font-medium tabular-nums hover:bg-muted">
        {Math.round(p.zoom * 100)}%
      </button>
      <ToolButton label="Zoom in" onClick={p.onZoomIn}>
        <Plus className="size-4" />
      </ToolButton>
      <ToolButton label="Fit the whole board" onClick={p.onFit}>
        <Maximize className="size-4" />
      </ToolButton>
      {p.moved && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Reset layout" onClick={p.onReset}>
            <LayoutGrid className="size-4" /> <span className="hidden md:inline">Reset</span>
          </ToolButton>
        </>
      )}
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}
