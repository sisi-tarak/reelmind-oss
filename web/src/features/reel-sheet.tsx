import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/lib/db';
import { moodFor } from '@/lib/emotion';
import { topicLabel } from '@/lib/topics';
import type { Analysis, Reel } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { useBatch } from './batch';
import { Infographic } from './infographic';
import { ReelThumb } from './reel-hover';

export interface RelatedReel {
  reel: Reel;
  analysis: Analysis;
  reason: string;
}

export function ReelSheet({
  reel,
  analysis,
  related,
  onOpenReel,
  onShare,
  onOpenChange,
}: {
  reel: Reel | null;
  analysis: Analysis | null;
  related: RelatedReel[];
  onOpenReel: (id: string) => void;
  onShare: (id: string) => void;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={Boolean(reel && analysis)} onOpenChange={onOpenChange} modal={false}>
      <SheetContent onInteractOutside={(e) => e.preventDefault()} aria-describedby={undefined} className="max-w-[560px]">
        {reel && analysis && <Body key={reel.shortcode} reel={reel} analysis={analysis} related={related} onOpenReel={onOpenReel} onShare={() => onShare(reel.shortcode)} />}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children, className, style }: { title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={cn('flex flex-col gap-2.5 border-t px-6 py-5', className)} style={style}>
      <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Body({ reel, analysis, related, onOpenReel, onShare }: { reel: Reel; analysis: Analysis; related: RelatedReel[]; onOpenReel: (id: string) => void; onShare: () => void }) {
  const mood = moodFor(analysis.contentType);
  const color = mood.color;
  const [copied, setCopied] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const task = analysis.practiceTask;

  const copy = async () => {
    await navigator.clipboard.writeText(task.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex flex-col gap-3 px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-center gap-1.5 pr-8">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: color }} title={mood.feeling}>
            <mood.icon className="size-3.5" />
            {mood.label}
          </span>
          {analysis.topics.map((t) => (
            <Badge key={t} variant="outline">
              {topicLabel(t)}
            </Badge>
          ))}
          <Badge variant="outline">{analysis.difficulty}</Badge>
        </div>
        <div className="flex gap-4">
        <a href={reel.url} target="_blank" rel="noreferrer" title="Watch on Instagram" className="shrink-0">
          <ReelThumb reel={reel} analysis={analysis} show compact className="h-[124px] w-[94px] rounded-lg border" />
        </a>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SheetTitle className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">{analysis.title}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{reel.creator ? `@${reel.creator}` : 'Unknown creator'}</span>
            {reel.savedAt && <span>Saved {formatDate(reel.savedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            {analysis.language && <span>{analysis.language}</span>}
            <a href={reel.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
              Watch on Instagram <ExternalLink className="size-3" />
            </a>
            <button onClick={onShare} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
              <Share2 className="size-3" /> Share
            </button>
          </div>
        </SheetDescription>
        </div>
        </div>
        <p className="text-[15px] leading-[1.55]">{analysis.summary}</p>
        {analysis.captionOnly && <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">The video couldn't be downloaded, so this was made from the caption only.</p>}
      </header>

      <Section title={analysis.infographic.headline || 'At a glance'} style={{ background: mood.tint }}>
        <Infographic data={analysis.infographic} accent={color} />
      </Section>

      {analysis.keyPoints.length > 0 && (
        <Section title="Key points">
          <ul className="flex flex-col gap-2">
            {analysis.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(task.title || task.steps.length > 0) && (
        <Section title="Practice">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Checkbox
              className="mt-0.5"
              checked={Boolean(reel.practiceDone)}
              onCheckedChange={(v) => db.reels.update(reel.shortcode, { practiceDone: v === true })}
              aria-label="Mark practice as done"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className={cn('text-[15px] font-semibold leading-snug', reel.practiceDone && 'text-muted-foreground line-through')}>{task.title || 'Try it yourself'}</p>
              <ol className="list-decimal space-y-1 pl-4 text-[14px] leading-snug">
                {task.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {task.code && (
                <div className="relative mt-1 overflow-hidden rounded-md bg-foreground text-[12.5px] text-background">
                  <div className="flex items-center justify-between border-b border-background/15 px-3 py-1.5 text-[11.5px] text-background/60">
                    {task.language || 'code'}
                    <button onClick={copy} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background/10 hover:text-background">
                      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-3 font-mono leading-relaxed">
                    <code>{task.code}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {analysis.tools.length > 0 && (
        <Section title="Tools and links">
          <ul className="flex flex-col divide-y rounded-lg border">
            {analysis.tools.map((t, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-snug">
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        {t.name}
                      </a>
                    ) : (
                      t.name
                    )}
                  </p>
                  {t.note && <p className="text-[13px] leading-snug text-muted-foreground">{t.note}</p>}
                </div>
                <Badge variant="outline">{t.kind}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Connected reels">
          <ul className="flex flex-col gap-1">
            {related.map((r) => {
              const m = moodFor(r.analysis.contentType);
              return (
                <li key={r.reel.shortcode}>
                  <button onClick={() => onOpenReel(r.reel.shortcode)} className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                    <m.icon className="mt-0.5 size-4 shrink-0" style={{ color: m.color }} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium leading-snug">{r.analysis.title}</span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {topicLabel(r.analysis.primaryTopic)}, linked by {r.reason.charAt(0).toLowerCase() + r.reason.slice(1)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(analysis.transcript || analysis.onScreenText) && (
        <Section title="Transcript">
          <button onClick={() => setShowTranscript((v) => !v)} className="flex items-center gap-1 self-start text-[13px] font-medium">
            {showTranscript ? 'Hide' : 'Show'} what was said and shown
            <ChevronDown className={cn('size-4 transition-transform', showTranscript && 'rotate-180')} />
          </button>
          {showTranscript && (
            <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
              {analysis.transcript && <p className="whitespace-pre-wrap">{analysis.transcript}</p>}
              {analysis.onScreenText && <p className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[12.5px]">{analysis.onScreenText}</p>}
            </div>
          )}
        </Section>
      )}

      <Reanalyze reel={reel} analysis={analysis} />
    </div>
  );
}

function Reanalyze({ reel, analysis }: { reel: Reel; analysis: Analysis }) {
  const { start, ready, health, job, starting, error } = useBatch();
  const [asking, setAsking] = useState(false);
  const [requested, setRequested] = useState(false);
  const running = job?.status === 'running';
  // This reel's place in the current batch, so a re-analysis shows its progress and any error right here.
  const mine = job?.kind === 'analyze' ? job.items.find((i) => i.shortcode === reel.shortcode) : undefined;
  const busy = Boolean(mine && running && mine.step !== 'done' && mine.step !== 'failed' && mine.step !== 'cached');
  const isSample = reel.collections?.includes('ReelMind sample');
  const options = [
    { id: 'gemini' as const, label: 'Gemini', note: 'watches the video and hears the speech', ok: Boolean(health?.demo || health?.gemini?.configured) },
    { id: 'claude' as const, label: 'Claude', note: 'reads still frames and the transcript, often deeper notes', ok: Boolean(health?.demo || health?.claude?.configured) },
  ];
  return (
    <div className="flex flex-col gap-3 border-t px-6 py-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-[12px] text-muted-foreground">
          Analyzed {formatDate(analysis.analyzedAt, { day: 'numeric', month: 'short', year: 'numeric' })} with {analysis.provider === 'demo' ? 'demo data' : analysis.model}.
        </p>
        {!isSample && (
          <Button size="sm" variant="outline" onClick={() => setAsking((v) => !v)} disabled={!ready || running}>
            <RefreshCw /> Re-analyze
          </Button>
        )}
      </div>
      {asking && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <p className="text-[13px]">This replaces these notes and uses one more AI call. Pick who analyzes it:</p>
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <Button
                key={o.id}
                variant="outline"
                className="h-auto justify-start py-2 text-left"
                disabled={!o.ok || starting}
                onClick={async () => {
                  setRequested(true);
                  await start([reel], { force: true, provider: o.id });
                  setAsking(false);
                }}
              >
                {starting ? <Loader2 className="animate-spin" /> : null}
                <span>
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-[12px] font-normal text-muted-foreground">{o.ok ? o.note : `Add a ${o.label} key in helper/.env to use this`}</span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" /> {mine?.step === 'fetching' ? 'Downloading the reel…' : mine?.step === 'analyzing' ? 'Writing new notes…' : 'Waiting its turn…'}
        </p>
      )}
      {mine?.step === 'failed' && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive" role="alert">Re-analyze failed: {mine.error || 'unknown error'}</p>}
      {mine?.step === 'done' && !running && <p className="text-[13px] text-success">Updated with new notes.</p>}
      {mine && !running && job?.status !== 'done' && mine.step !== 'done' && mine.step !== 'failed' && job?.message && <p className="rounded-md bg-muted px-3 py-2 text-[13px]">{job.message}</p>}
      {requested && !mine && error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive" role="alert">{error}</p>}
    </div>
  );
}
