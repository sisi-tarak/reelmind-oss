// A topic's own page: its reels, and the topic board that merges them into one learning path.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, History, Loader2, RefreshCw, Share2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/lib/db';
import { moodFor } from '@/lib/emotion';
import { helper } from '@/lib/helper';
import { openHistory, recordGeneration } from '@/lib/history';
import { topicLabel } from '@/lib/topics';
import type { TopicBoard } from '@/lib/types';
import { cn, formatDate, plural } from '@/lib/utils';
import { useBatch } from './batch';
import type { CanvasItem } from './canvas';

function ReelChip({ item, onOpen }: { item: CanvasItem | undefined; onOpen: (id: string) => void }) {
  if (!item) return null;
  const mood = moodFor(item.analysis.contentType);
  const Icon = mood.icon;
  return (
    <button onClick={() => onOpen(item.reel.shortcode)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-left text-[12px] hover:bg-muted" style={{ borderColor: mood.edge }}>
      <Icon className="size-3 shrink-0" style={{ color: mood.color }} />
      <span className="truncate">{item.analysis.title}</span>
    </button>
  );
}

export function TopicSheet({ topic, items, onOpenReel, onShare, onClose }: { topic: string | null; items: CanvasItem[]; onOpenReel: (id: string) => void; onShare: (topic: string) => void; onClose: () => void }) {
  return (
    <Sheet open={Boolean(topic)} onOpenChange={(v) => !v && onClose()} modal={false}>
      <SheetContent onInteractOutside={(e) => e.preventDefault()} className="max-w-[560px]">
        {topic && <Body topic={topic} items={items.filter((i) => i.analysis.primaryTopic === topic)} onOpenReel={onOpenReel} onShare={() => onShare(topic)} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ topic, items, onOpenReel, onShare }: { topic: string; items: CanvasItem[]; onOpenReel: (id: string) => void; onShare: () => void }) {
  const { ready, provider, health } = useBatch();
  const board = useLiveQuery(() => db.topicBoards.get(topic), [topic]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(items.map((i) => [i.reel.shortcode, i]));
  const ids = items.map((i) => i.reel.shortcode).sort();
  const stale = board ? board.reelIds.length !== ids.length || ids.some((id) => !board.reelIds.includes(id)) : false;
  const added = board ? ids.filter((id) => !board.reelIds.includes(id)).length : 0;
  const mood = moodFor(dominant(items.map((i) => i.analysis.contentType)));
  const saved = items.map((i) => i.reel.savedAt).filter(Boolean).sort() as string[];
  const providerOk = health && !health.needsCode && (health.demo || (provider === 'claude' ? health.claude?.configured : health.gemini?.configured));

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const { board: made } = await helper.topicBoard(topic, items.map((i) => i.analysis), provider);
      await db.topicBoards.put({ ...made, topic } as TopicBoard);
      await recordGeneration({ kind: 'board', key: topic, title: `Topic board: ${topicLabel(topic)}`, request: `Build a topic board from ${plural(items.length, 'reel')} on ${topicLabel(topic)}`, preview: made.overview, model: made.model, data: { ...made, topic } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex flex-col gap-2 px-6 pb-5 pt-6" style={{ background: mood.tint }}>
        <div className="flex items-center gap-2 pr-8">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: mood.color }}>
            <mood.icon className="size-3.5" />
            Mostly {mood.label.toLowerCase()}
          </span>
          <Badge variant="outline">Topic</Badge>
        </div>
        <SheetTitle className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{topicLabel(topic)}</SheetTitle>
        <Button size="sm" variant="outline" className="self-start bg-background" onClick={onShare}>
          <Share2 /> Share or export this topic
        </Button>
        <SheetDescription className="text-[13px] text-muted-foreground">
          {plural(items.length, 'reel')}
          {saved.length ? `, saved ${formatDate(saved[0])} to ${formatDate(saved[saved.length - 1])}` : ''}. Practised {items.filter((i) => i.reel.practiceDone).length} of {items.length}.
        </SheetDescription>
      </header>

      <section className="flex flex-col gap-2 border-t px-6 py-5">
        <h3 className="text-[13px] font-semibold text-muted-foreground">Reels in this topic</h3>
        <ul className="flex flex-col gap-1.5">
          {items.map((i) => (
            <li key={i.reel.shortcode}>
              <ReelChip item={i} onOpen={onOpenReel} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 border-t px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Topic board</h3>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => openHistory({ kind: 'board', key: topic })} title="Earlier versions of this board">
              <History /> History
            </Button>
            {board && (
              <Button size="sm" variant="ghost" onClick={build} disabled={busy || !ready || !providerOk}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Rebuild
              </Button>
            )}
          </div>
        </div>

        {items.length < 2 && <p className="text-[13.5px] text-muted-foreground">A topic board merges two or more reels into one learning path. Save another reel on {topicLabel(topic)} to build one.</p>}

        {items.length >= 2 && !board && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <p className="text-[14px] leading-relaxed">
              Merge these {items.length} reels into one page: what they teach together, a step-by-step learning path, where they agree or disagree, and one project that uses all of them.
            </p>
            <p className="text-[12.5px] text-muted-foreground">One AI call, using notes you already have. Saved, so opening it again is free.</p>
            <Button variant="highlight" className="self-start" onClick={build} disabled={busy || !ready || !providerOk}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {busy ? 'Building…' : 'Build topic board'}
            </Button>
            {!ready && <p className="text-[12.5px] text-muted-foreground">Start the helper on your computer to build boards.</p>}
          </div>
        )}

        {stale && (
          <p className="flex items-start gap-2 rounded-md bg-highlight/30 px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {added > 0 ? `${plural(added, 'new reel')} joined this topic since the board was made.` : 'The reels in this topic changed since the board was made.'} Rebuild to include them.
          </p>
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
        {board && <BoardView board={board} byId={byId} onOpen={onOpenReel} accent={mood.color} />}
      </section>
    </div>
  );
}

function dominant(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
}

function BoardView({ board, byId, onOpen, accent }: { board: TopicBoard; byId: Map<string, CanvasItem>; onOpen: (id: string) => void; accent: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] leading-[1.6]">{board.overview}</p>

      {board.learningPath.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-[13px] font-semibold text-muted-foreground">Learning path</h4>
          <ol className="relative flex flex-col gap-4">
            <span className="absolute bottom-3 left-[13px] top-3 w-px" style={{ background: accent, opacity: 0.35 }} aria-hidden />
            {board.learningPath.map((step, i) => (
              <li key={i} className="relative flex gap-3">
                <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: accent }}>
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
                  <p className="text-[14px] font-semibold leading-snug">{step.title}</p>
                  <p className="text-[13.5px] leading-snug text-muted-foreground">{step.detail}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {step.reelIds.map((id) => (
                      <ReelChip key={id} item={byId.get(id)} onOpen={onOpen} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {board.comparison.columns.length >= 2 && board.comparison.rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[13px] font-semibold text-muted-foreground">How the options compare</h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-muted">
                  <th className="px-3 py-2 text-left font-normal text-muted-foreground" />
                  {board.comparison.columns.map((c, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold" style={{ color: accent }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.comparison.rows.map((r, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="px-3 py-2 font-medium text-muted-foreground">{r.aspect}</td>
                    {board.comparison.columns.map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        {r.values[j] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(board.agreements.length > 0 || board.contradictions.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PointList title="Where they agree" items={board.agreements} color="#16a34a" empty="No shared points found." />
          <PointList title="Where they disagree" items={board.contradictions} color="#e5484d" empty="No conflicting advice found." />
        </div>
      )}

      {board.project.title && (
        <div className="flex flex-col gap-2 rounded-lg border p-4" style={{ borderColor: accent }}>
          <h4 className="text-[13px] font-semibold text-muted-foreground">Project that uses all of it</h4>
          <p className="text-[16px] font-semibold leading-snug">{board.project.title}</p>
          <p className="text-[13.5px] text-muted-foreground">{board.project.goal}</p>
          <ol className="list-decimal space-y-1 pl-5 text-[14px] leading-snug">
            {board.project.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">
        Built {formatDate(board.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} with {board.provider === 'demo' ? 'demo data' : board.model}.
      </p>
    </div>
  );
}

function PointList({ title, items, color, empty }: { title: string; items: string[]; color: string; empty: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border p-3')} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <h4 className="text-[13px] font-semibold" style={{ color }}>
        {title}
      </h4>
      {items.length ? (
        <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
