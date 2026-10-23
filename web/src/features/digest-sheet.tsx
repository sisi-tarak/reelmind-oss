// Weekly recap: what you saved this week, what's left to practise, and a short quiz to make it stick.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, History, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/lib/db';
import { moodFor } from '@/lib/emotion';
import { helper } from '@/lib/helper';
import { openHistory, recordGeneration } from '@/lib/history';
import { topicLabel } from '@/lib/topics';
import type { Digest, Reel } from '@/lib/types';
import { cn, formatDate, plural } from '@/lib/utils';
import { inRange, weekRange } from '@/lib/week';
import { useBatch } from './batch';
import type { CanvasItem } from './canvas';

const REVIEW_COUNT = 3;

export function DigestSheet({ open, onOpenChange, items, reels, onOpenReel }: { open: boolean; onOpenChange: (v: boolean) => void; items: CanvasItem[]; reels: Reel[]; onOpenReel: (id: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent onInteractOutside={(e) => e.preventDefault()} className="max-w-[560px]">
        {open && <Body items={items} reels={reels} onOpenReel={onOpenReel} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ items, reels, onOpenReel }: { items: CanvasItem[]; reels: Reel[]; onOpenReel: (id: string) => void }) {
  const { ready, provider, health } = useBatch();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const range = weekRange(weeksAgo);
  const digest = useLiveQuery(() => db.digests.get(range.key), [range.key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const week = items.filter((i) => inRange(i.reel.savedAt || i.analysis.analyzedAt, range.start, range.end));
    const waiting = reels.filter((r) => r.status !== 'analyzed' && inRange(r.savedAt, range.start, range.end)).length;
    const before = new Set(items.filter((i) => new Date(i.reel.savedAt || i.analysis.analyzedAt) < range.start).map((i) => i.analysis.primaryTopic));
    const topics = new Map<string, number>();
    for (const i of week) topics.set(i.analysis.primaryTopic, (topics.get(i.analysis.primaryTopic) || 0) + 1);
    const newTopics = [...topics.keys()].filter((t) => !before.has(t));
    const openPractice = week.filter((i) => !i.reel.practiceDone && i.analysis.practiceTask.title);
    // Older reels you haven't practised or reviewed recently come back for review.
    const review = items
      .filter((i) => new Date(i.reel.savedAt || i.analysis.analyzedAt) < range.start && !i.reel.practiceDone)
      .sort((a, b) => (a.reel.lastReviewedAt || '').localeCompare(b.reel.lastReviewedAt || ''))
      .slice(0, REVIEW_COUNT);
    return { week, waiting, topics: [...topics.entries()].sort((a, b) => b[1] - a[1]), newTopics, openPractice, review };
    // range is rebuilt each render; its key is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, reels, range.key]);

  const byId = new Map(items.map((i) => [i.reel.shortcode, i]));
  const providerOk = health && !health.needsCode && (health.demo || (provider === 'claude' ? health.claude?.configured : health.gemini?.configured));

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const { digest: made } = await helper.digest(range.key, stats.week.map((i) => i.analysis), stats.review.map((i) => i.analysis), provider);
      await db.digests.put({ ...made, weekStart: range.key, answers: made.quiz.map(() => -1) });
      await recordGeneration({ kind: 'recap', key: range.key, title: made.headline || 'Weekly recap', request: `Recap the week of ${range.key}: ${plural(stats.week.length, 'reel')}`, preview: made.highlights.map((h) => h.summary).join(' '), model: made.model, data: { ...made, weekStart: range.key } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const end = new Date(range.end);
  end.setDate(end.getDate() - 1);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex flex-col gap-3 px-6 pb-5 pt-6">
        <SheetTitle className="text-[22px] font-semibold tracking-[-0.02em]">Weekly recap</SheetTitle>
        <SheetDescription className="text-[13px] text-muted-foreground">
          {formatDate(range.start.toISOString())} to {formatDate(end.toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}
        </SheetDescription>
        <div className="flex gap-1.5">
          {['This week', 'Last week', '2 weeks ago'].map((label, i) => (
            <button key={label} onClick={() => setWeeksAgo(i)} className={cn('rounded-full border px-3 py-1 text-[13px]', weeksAgo === i ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
              {label}
            </button>
          ))}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Analyzed" value={stats.week.length} />
          <Stat label="Still waiting" value={stats.waiting} />
          <Stat label="To practise" value={stats.openPractice.length} />
        </dl>
      </header>

      {stats.week.length === 0 ? (
        <p className="border-t px-6 py-6 text-[14px] text-muted-foreground">No analyzed reels were saved in this week. Pick another week, or analyze what's waiting in your queue.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2 border-t px-6 py-5">
            <h3 className="text-[13px] font-semibold text-muted-foreground">Topics this week</h3>
            <div className="flex flex-wrap gap-1.5">
              {stats.topics.map(([t, n]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px]">
                  {topicLabel(t)} <span className="text-muted-foreground">{n}</span>
                  {stats.newTopics.includes(t) && <span className="rounded-full bg-highlight px-1.5 text-[10.5px] font-semibold text-highlight-foreground">New topic</span>}
                </span>
              ))}
            </div>
          </section>

          {stats.openPractice.length > 0 && (
            <section className="flex flex-col gap-2 border-t px-6 py-5">
              <h3 className="text-[13px] font-semibold text-muted-foreground">Practice still to do</h3>
              <ul className="flex flex-col gap-1">
                {stats.openPractice.map((i) => (
                  <li key={i.reel.shortcode}>
                    <button onClick={() => onOpenReel(i.reel.shortcode)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-muted">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: moodFor(i.analysis.contentType).color }} />
                      <span>
                        <span className="font-medium">{i.analysis.practiceTask.title}</span>
                        <span className="block text-[12.5px] text-muted-foreground">from {i.analysis.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-4 border-t px-6 py-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">Recap and quiz</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openHistory({ kind: 'recap' })} title="Earlier recaps">
                  <History /> History
                </Button>
                {digest && (
                  <Button size="sm" variant="ghost" onClick={build} disabled={busy || !ready || !providerOk}>
                    {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Rebuild
                  </Button>
                )}
              </div>
            </div>
            {!digest && (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
                <p className="text-[14px] leading-relaxed">
                  Turn this week's {plural(stats.week.length, 'reel')} into a short recap and a quiz{stats.review.length ? `, plus ${stats.review.length} questions on older reels you haven't practised` : ''}.
                </p>
                <p className="text-[12.5px] text-muted-foreground">One AI call, from notes you already have. Saved for this week.</p>
                <Button variant="highlight" className="self-start" onClick={build} disabled={busy || !ready || !providerOk}>
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {busy ? 'Building…' : "Build this week's recap"}
                </Button>
                {!ready && <p className="text-[12.5px] text-muted-foreground">Start the helper on your computer to build a recap.</p>}
              </div>
            )}
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
            {digest && <DigestView digest={digest} byId={byId} onOpenReel={onOpenReel} />}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted py-2">
      <dd className="text-lg font-semibold leading-tight">{value}</dd>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function DigestView({ digest, byId, onOpenReel }: { digest: Digest; byId: Map<string, CanvasItem>; onOpenReel: (id: string) => void }) {
  const answers = digest.answers && digest.answers.length === digest.quiz.length ? digest.answers : digest.quiz.map(() => -1);
  const answered = answers.filter((a) => a >= 0).length;
  const correct = answers.filter((a, i) => a === digest.quiz[i]?.answerIndex).length;
  const current = answers.findIndex((a) => a < 0);

  const pick = async (qi: number, option: number) => {
    const next = [...answers];
    next[qi] = option;
    await db.digests.update(digest.weekStart, { answers: next });
    const reelId = digest.quiz[qi].reelId;
    if (reelId) await db.reels.update(reelId, { lastReviewedAt: new Date().toISOString() });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] font-medium leading-snug">{digest.headline}</p>
      <ul className="flex flex-col gap-3">
        {digest.highlights.map((h, i) => (
          <li key={i} className="flex flex-col gap-1">
            <p className="text-[14px] font-semibold">{topicLabel(h.topic)}</p>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{h.summary}</p>
          </li>
        ))}
      </ul>

      {digest.quiz.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-semibold text-muted-foreground">
              Quiz, {answered} of {digest.quiz.length} answered
            </h4>
            {answered > 0 && (
              <button onClick={() => db.digests.update(digest.weekStart, { answers: digest.quiz.map(() => -1) })} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
                <RotateCcw className="size-3.5" /> Start over
              </button>
            )}
          </div>
          {current === -1 && (
            <p className="rounded-lg bg-success/10 px-3 py-2.5 text-[14px] font-medium text-success">
              You got {correct} of {digest.quiz.length} right.{correct < digest.quiz.length ? ' Open the reels you missed below to refresh them.' : ' Everything stuck.'}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {digest.quiz.map((q, qi) => {
              const chosen = answers[qi];
              const done = chosen >= 0;
              if (!done && qi !== current) return null;
              const reel = byId.get(q.reelId);
              return (
                <li key={qi} className="flex flex-col gap-2 rounded-lg border p-3.5">
                  <p className="text-[14px] font-semibold leading-snug">
                    {qi + 1}. {q.question}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((o, oi) => {
                      const right = oi === q.answerIndex;
                      return (
                        <button
                          key={oi}
                          disabled={done}
                          onClick={() => pick(qi, oi)}
                          className={cn(
                            'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-[13.5px] leading-snug transition-colors',
                            !done && 'hover:bg-muted',
                            done && right && 'border-success bg-success/10',
                            done && chosen === oi && !right && 'border-destructive bg-destructive/10',
                          )}
                        >
                          {done && right && <Check className="mt-0.5 size-4 shrink-0 text-success" />}
                          {done && chosen === oi && !right && <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
                          {o}
                        </button>
                      );
                    })}
                  </div>
                  {done && (
                    <p className="text-[13px] leading-snug text-muted-foreground">
                      {q.explanation}{' '}
                      {reel && (
                        <button onClick={() => onOpenReel(q.reelId)} className="font-medium text-foreground underline underline-offset-4">
                          Open the reel
                        </button>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
