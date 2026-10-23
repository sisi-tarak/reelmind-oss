import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Blocks, BrainCircuit, CalendarCheck, Check, ChevronDown, Copy, History, Layers, Loader2, PencilLine, RotateCcw, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/lib/db';
import { formatBytes, readGeneration } from '@/lib/history';
import { topicLabel } from '@/lib/topics';
import type { Digest, Generation, GenerationKind, TopicBoard } from '@/lib/types';
import { cn, plural } from '@/lib/utils';

const KINDS: { kind: GenerationKind; label: string; icon: LucideIcon; restore?: string }[] = [
  { kind: 'board', label: 'Topic boards', icon: Layers, restore: 'Use this version' },
  { kind: 'recap', label: 'Recaps', icon: CalendarCheck, restore: 'Use this version' },
  { kind: 'rewrite', label: 'Rewrites', icon: PencilLine, restore: 'Use this version' },
  { kind: 'cards', label: 'Flashcards', icon: BrainCircuit },
  { kind: 'assets', label: 'Library finds', icon: Blocks },
];
const kindOf = (k: GenerationKind) => KINDS.find((x) => x.kind === k)!;

type Rewrite = { before: string; after: string; instruction: string; assetId: string; title: string };
type CardsLog = Record<string, { title: string; cards: { q: string; a: string }[] }>;
type AssetsLog = Record<string, { title: string; assets: { skills: { name: string }[]; prompts: { title: string }[]; snippets: { title: string }[]; workflows: { title: string }[] } }>;

/** Plain text for copying, and the body shown when an entry is opened. */
function asText(kind: GenerationKind, data: unknown): string {
  if (kind === 'board') {
    const b = data as TopicBoard;
    return [
      `${topicLabel(b.topic)}`,
      '',
      b.overview,
      '',
      'Learning path:',
      ...b.learningPath.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`),
      ...(b.agreements.length ? ['', 'They agree:', ...b.agreements.map((a) => `- ${a}`)] : []),
      ...(b.contradictions.length ? ['', 'They disagree:', ...b.contradictions.map((a) => `- ${a}`)] : []),
      ...(b.project.title ? ['', `Project: ${b.project.title}`, b.project.goal, ...b.project.steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    ].join('\n');
  }
  if (kind === 'recap') {
    const d = data as Digest;
    return [d.headline, '', ...d.highlights.map((h) => `${topicLabel(h.topic)}: ${h.summary}`), '', 'Quiz:', ...d.quiz.map((q, i) => `${i + 1}. ${q.question}\n   Answer: ${q.options[q.answerIndex]}`)].join('\n');
  }
  if (kind === 'rewrite') return (data as Rewrite).after;
  if (kind === 'cards') return Object.values(data as CardsLog).map((r) => [r.title, ...r.cards.map((c) => `Q: ${c.q}\nA: ${c.a}`)].join('\n')).join('\n\n');
  return Object.values(data as AssetsLog)
    .map((r) => {
      const a = r.assets;
      const parts = [...a.skills.map((x) => `Skill: ${x.name}`), ...a.prompts.map((x) => `Prompt: ${x.title}`), ...a.snippets.map((x) => `Code: ${x.title}`), ...a.workflows.map((x) => `Workflow: ${x.title}`)];
      return `${r.title}\n${parts.length ? parts.map((p) => `- ${p}`).join('\n') : '- nothing reusable'}`;
    })
    .join('\n\n');
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function HistoryDialog({ open, onOpenChange, filter }: { open: boolean; onOpenChange: (v: boolean) => void; filter: { kind?: GenerationKind; key?: string } }) {
  const [kind, setKind] = useState<GenerationKind | 'all'>('all');
  const [key, setKey] = useState<string | undefined>();
  const [confirmClear, setConfirmClear] = useState(false);
  const rows = useLiveQuery(() => db.generations.orderBy('createdAt').reverse().toArray(), [], [] as Generation[]);

  useEffect(() => {
    if (!open) return;
    setKind(filter.kind || 'all');
    setKey(filter.key);
    setConfirmClear(false);
  }, [open, filter]);

  const visibleKinds = KINDS;
  const shown = useMemo(() => rows.filter((r) => (kind === 'all' || r.kind === kind) && (!key || r.key === key)), [rows, kind, key]);
  const total = useMemo(() => rows.reduce((n, r) => n + r.bytes, 0), [rows]);
  const groups = useMemo(() => {
    const out: { day: string; items: Generation[] }[] = [];
    for (const g of shown) {
      const day = dayLabel(g.createdAt);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(g);
    }
    return out;
  }, [shown]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(860px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-[820px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pb-3 pt-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-[18px] font-semibold">
            <History className="size-5" /> History
          </DialogTitle>
          <DialogDescription className="text-[13px]">Everything the AI made for you, newest first. Open any entry to read it again, copy it, or bring back an earlier version.</DialogDescription>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
            {[{ kind: 'all' as const, label: 'All' }, ...visibleKinds].map((k) => (
              <button
                key={k.kind}
                onClick={() => (setKind(k.kind), setKey(undefined))}
                className={cn('shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium', kind === k.kind ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted')}
              >
                {k.label}
              </button>
            ))}
          </div>
          {key && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Showing versions of one item.{' '}
              <button onClick={() => setKey(undefined)} className="font-medium text-foreground underline underline-offset-2">
                Show all {kind === 'all' ? '' : kindOf(kind as GenerationKind).label.toLowerCase()}
              </button>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] px-4 py-4 sm:px-6">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <History className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-3 text-[15px] font-medium">Nothing here yet</p>
              <p className="mt-1 max-w-[360px] text-[13px] text-muted-foreground">Topic boards, recaps, rewrites and other AI results appear here as you make them.</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.day} className="mb-5">
                <p className="sticky top-0 z-[1] mx-auto mb-3 w-fit rounded-full bg-background px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-sm">{g.day}</p>
                <div className="flex flex-col gap-4">
                  {g.items.map((item) => (
                    <Entry key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 text-[12.5px] text-muted-foreground">
          <span>
            {plural(rows.length, 'entry', 'entries')}, {formatBytes(total)} compressed, stored only in this browser. Older versions are trimmed automatically.
          </span>
          {rows.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className={cn('ml-auto', confirmClear && 'text-destructive')}
              onClick={async () => {
                if (!confirmClear) return setConfirmClear(true);
                await db.generations.clear();
                setConfirmClear(false);
              }}
            >
              <Trash2 /> {confirmClear ? 'Click again to clear all' : 'Clear history'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Entry({ item }: { item: Generation }) {
  const meta = kindOf(item.kind);
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const load = async () => {
    if (data) return data;
    setLoading(true);
    try {
      const d = await readGeneration(item);
      setData(d);
      return d;
    } finally {
      setLoading(false);
    }
  };
  const flash = (msg: string) => {
    setDone(msg);
    setTimeout(() => setDone(null), 1800);
  };

  const restore = async () => {
    const d = (await load()) as Record<string, unknown>;
    if (item.kind === 'board') await db.topicBoards.put(d as unknown as TopicBoard);
    if (item.kind === 'recap') {
      const r = d as unknown as Digest;
      await db.digests.put({ ...r, answers: r.quiz.map(() => -1) });
    }
    if (item.kind === 'rewrite') {
      const r = d as unknown as Rewrite;
      await db.assetEdits.put({ id: r.assetId, content: r.after, updatedAt: new Date().toISOString() });
    }
    flash('Restored');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {item.request && (
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-[13.5px] leading-snug text-background">{item.request}</div>
      )}
      <div className="flex max-w-[94%] items-start gap-2.5">
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-background px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-[14px] font-semibold">{item.title}</p>
            <span className="text-[11.5px] text-muted-foreground">
              {meta.label} · {time}
              {item.model && item.model !== 'demo' ? ` · ${item.model}` : ''}
            </span>
          </div>
          {open ? (
            loading || !data ? (
              <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground" />
            ) : (
              <pre className="mt-2 max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed">{asText(item.kind, data)}</pre>
            )
          ) : (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{item.preview}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={async () => {
                if (!open) await load();
                setOpen((v) => !v);
              }}
            >
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} /> {open ? 'Hide' : 'Open'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={async () => {
                await navigator.clipboard.writeText(asText(item.kind, await load()));
                flash('Copied');
              }}
            >
              <Copy /> Copy
            </Button>
            {meta.restore && (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={restore}>
                <RotateCcw /> {meta.restore}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => db.generations.delete(item.id)} aria-label="Delete this entry">
              <Trash2 />
            </Button>
            {done && (
              <span className="flex items-center gap-1 text-[12px] font-medium text-success">
                <Check className="size-3.5" /> {done}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
