import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Flame, History, Loader2, PartyPopper, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/db';
import { moodFor } from '@/lib/emotion';
import { helper } from '@/lib/helper';
import { openHistory, recordGeneration } from '@/lib/history';
import { answer, ensureCards, GRADES, intervalLabel, NEW_LIMIT_CHOICES, newPerDay, setNewPerDay, streak, todaysQueue, type Grade } from '@/lib/review';
import type { Analysis, Card } from '@/lib/types';
import { cn, plural } from '@/lib/utils';
import { useBatch } from './batch';
import type { CanvasItem } from './canvas';

const GRADE_STYLE: Record<Grade, string> = {
  0: 'border-destructive/40 text-destructive hover:bg-destructive/5',
  1: 'border-highlight/60 text-[#a16207] hover:bg-highlight/10',
  2: 'border-success/50 text-success hover:bg-success/5',
  3: 'border-[#2563eb]/40 text-[#2563eb] hover:bg-[#2563eb]/5',
};

/** Keeps cards in step with analyzed reels, and returns how many are waiting today. */
export function useReviewCount(items: CanvasItem[]) {
  useEffect(() => {
    const t = setTimeout(() => ensureCards(items.map((i) => i.analysis)).catch(() => undefined), 400);
    return () => clearTimeout(t);
  }, [items]);
  return useLiveQuery(
    async () => {
      const [cards, reviews] = await Promise.all([db.cards.toArray(), db.reviews.where('at').aboveOrEqual(new Date(Date.now() - 86_400_000).toISOString()).toArray()]);
      return todaysQueue(cards, reviews).queue.length;
    },
    [],
    0,
  );
}

export function ReviewDialog({ open, onOpenChange, items, onOpenReel }: { open: boolean; onOpenChange: (v: boolean) => void; items: CanvasItem[]; onOpenReel: (id: string) => void }) {
  const byId = useMemo(() => new Map(items.map((i) => [i.reel.shortcode, i])), [items]);
  const [session, setSession] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [limit, setLimit] = useState(newPerDay);
  const reviews = useLiveQuery(() => db.reviews.toArray(), [], []);
  const days = streak(reviews);

  // A fresh snapshot each time the dialog opens, so cards don't jump around mid-session.
  useEffect(() => {
    if (!open) return;
    (async () => {
      await ensureCards(items.map((i) => i.analysis));
      const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviews.toArray()]);
      setSession(todaysQueue(cards.filter((c) => byId.has(c.shortcode)), logs, limit).queue);
      setIndex(0);
      setFlipped(false);
      setAnswered(0);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, limit]);

  const card = session?.[index] || null;
  const item = card ? byId.get(card.shortcode) : undefined;

  const grade = async (g: Grade) => {
    if (!card || !session) return;
    const next = await answer(card, g);
    setAnswered((n) => n + 1);
    // "Again" comes back at the end of this session.
    if (g === 0) setSession([...session, next]);
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  useEffect(() => {
    if (!open || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        else grade(2);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        grade((Number(e.key) - 1) as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = session?.length || 0;
  const done = session !== null && index >= total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5 pr-12">
          <div>
            <DialogTitle className="text-[16px] font-semibold">Daily review</DialogTitle>
            <DialogDescription className="text-[12.5px]">A few minutes a day keeps what you saved from slipping away.</DialogDescription>
          </div>
          <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold', days ? 'bg-highlight/20 text-[#a16207]' : 'bg-muted text-muted-foreground')} title="Days in a row">
            <Flame className="size-3.5" /> {days}
          </span>
        </div>
        {session === null ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : done ? (
          <Finished answered={answered} items={items} limit={limit} onLimit={(n) => (setNewPerDay(n), setLimit(n))} onClose={() => onOpenChange(false)} />
        ) : card ? (
          <div className="flex flex-col">
            <Progress value={(index / total) * 100} className="h-1 rounded-none" />
            <div className="px-5 pt-4 text-[12px] text-muted-foreground">
              Card {index + 1} of {total}
              {card.lastReviewed ? '' : ' · new'}
            </div>
            <button
              onClick={() => setFlipped(true)}
              className={cn('mx-5 mt-2 flex min-h-[220px] flex-col justify-center rounded-xl border-[1.5px] px-6 py-6 text-left transition-colors', !flipped && 'hover:bg-muted/50')}
              style={item ? { borderColor: moodFor(item.analysis.contentType).edge, background: flipped ? moodFor(item.analysis.contentType).tint : undefined } : undefined}
              disabled={flipped}
            >
              <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em]">{card.front}</p>
              {flipped ? (
                <p className="mt-4 border-t pt-4 text-[15.5px] leading-relaxed">{card.back}</p>
              ) : (
                <p className="mt-5 text-[12.5px] text-muted-foreground">Think of the answer, then tap or press Space to check.</p>
              )}
            </button>
            {item && (
              <button
                onClick={() => {
                  onOpenChange(false);
                  onOpenReel(card.shortcode);
                }}
                className="mx-5 mt-2 truncate text-left text-[12px] text-muted-foreground hover:text-foreground"
              >
                From: <span className="font-medium underline-offset-2 hover:underline">{item.analysis.title}</span>
                {item.reel.creator ? ` by @${item.reel.creator}` : ''}
              </button>
            )}
            <div className="grid grid-cols-4 gap-2 p-5">
              {flipped ? (
                GRADES.map(({ grade: g, label, key }) => (
                  <button key={g} onClick={() => grade(g)} className={cn('flex flex-col items-center rounded-lg border-[1.5px] bg-background py-2 text-[13.5px] font-semibold', GRADE_STYLE[g])}>
                    {label}
                    <span className="text-[11px] font-normal opacity-80">
                      {intervalLabel(card, g)} · {key}
                    </span>
                  </button>
                ))
              ) : (
                <Button className="col-span-4" size="lg" onClick={() => setFlipped(true)}>
                  Show answer
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Finished({ answered, items, limit, onLimit, onClose }: { answered: number; items: CanvasItem[]; limit: number; onLimit: (n: number) => void; onClose: () => void }) {
  const { ready, provider } = useBatch();
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const nextDue = useLiveQuery(() => db.cards.orderBy('due').filter((c) => Boolean(c.lastReviewed) && Date.parse(c.due) > Date.now()).first(), []);
  const autoOnly = useLiveQuery(async () => {
    const cards = await db.cards.toArray();
    const ai = new Set(cards.filter((c) => c.source === 'ai').map((c) => c.shortcode));
    return items.filter((i) => !ai.has(i.reel.shortcode) && i.analysis.provider !== 'demo').map((i) => i.analysis);
  }, [items]);

  const upgrade = async (list: Analysis[]) => {
    setUpgrading(true);
    setMessage(null);
    try {
      let n = 0;
      const written: Record<string, { title: string; cards: { q: string; a: string }[] }> = {};
      for (let i = 0; i < list.length; i += 30) {
        const chunk = list.slice(i, i + 30);
        const result = await helper.flashcards(chunk, provider);
        for (const a of chunk) {
          const cards = result[a.shortcode];
          if (cards?.length) {
            await db.analyses.update(a.shortcode, { flashcards: cards });
            written[a.shortcode] = { title: a.title, cards };
            n += 1;
          }
        }
      }
      await ensureCards(await db.analyses.bulkGet(list.map((a) => a.shortcode)).then((rows) => rows.filter((r): r is Analysis => Boolean(r))));
      setMessage(`AI cards written for ${plural(n, 'reel')}. Cards you'd already studied were kept.`);
      if (n) await recordGeneration({ kind: 'cards', key: new Date().toISOString().slice(0, 10), title: `AI flashcards for ${plural(n, 'reel')}`, request: `Write review cards for ${plural(list.length, 'older reel')}`, preview: Object.values(written).flatMap((w) => w.cards.map((c) => c.q)).slice(0, 4).join(' · '), data: written });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <PartyPopper className="size-6" />
      </span>
      <p className="mt-3 text-[18px] font-semibold">{answered ? `Done for today: ${plural(answered, 'card')}` : 'Nothing due right now'}</p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {nextDue ? `Next card is due ${new Date(nextDue.due).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.` : 'Analyze more reels to get more cards.'}
      </p>
      <label className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground">
        New cards per day
        <select value={limit} onChange={(e) => onLimit(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1 text-foreground">
          {NEW_LIMIT_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {Boolean(autoOnly?.length) && (
        <div className="mt-5 w-full rounded-lg bg-muted p-3 text-left text-[13px]">
          <p className="flex items-center gap-1.5 font-medium">
            <Wand2 className="size-3.5" /> {plural(autoOnly!.length, 'reel')} {autoOnly!.length === 1 ? 'has' : 'have'} simple cards made from their notes
          </p>
          <p className="mt-0.5 text-muted-foreground">These reels were analyzed before AI cards existed. One small text-only AI call per six reels writes better ones. Videos are not analyzed again.</p>
          <Button size="sm" variant="outline" className="mt-2" disabled={!ready || upgrading} onClick={() => upgrade(autoOnly!)}>
            {upgrading ? <Loader2 className="animate-spin" /> : <Sparkles />} {ready ? 'Write AI cards' : 'Start the helper to write AI cards'}
          </Button>
        </div>
      )}
      {message && <p className="mt-3 text-[12.5px] text-muted-foreground">{message}</p>}
      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={() => openHistory({ kind: 'cards' })}>
          <History /> Card history
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
