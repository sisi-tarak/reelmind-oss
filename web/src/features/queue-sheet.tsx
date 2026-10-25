import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, ExternalLink, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { queueForLater, removeQueued } from '@/lib/db';
import type { Job, JobStep, Reel } from '@/lib/types';
import { cn, plural, relativeDay } from '@/lib/utils';
import { useBatch } from './batch';

type Range = 'all' | 'week' | 'month';
const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: 'all', label: 'All', days: null },
  { id: 'week', label: 'Saved in the last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 30 },
];

export function QueueSheet({ open, onOpenChange, queue }: { open: boolean; onOpenChange: (v: boolean) => void; queue: Reel[] }) {
  const { job } = useBatch();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent onInteractOutside={(e) => e.preventDefault()}>
        {job ? <Progress_ job={job} onClose={() => onOpenChange(false)} /> : <Selection queue={queue} />}
      </SheetContent>
    </Sheet>
  );
}

function HelperWarning() {
  const { health, healthError, browserBlocked, provider } = useBatch();
  let text: string | null = null;
  if (browserBlocked) text = healthError;
  else if (healthError) text = 'No helper reachable from this device. Pick reels and choose "Analyze when my computer is online": your computer analyzes them the next time its helper runs (needs sync on both devices). Or turn on phone access in Settings to analyze right now.';
  else if (health?.needsCode) text = 'The helper is running but this site isn\'t connected yet. Open Settings and enter the connect code from the helper window.';
  else if (health && !health.demo && provider === 'gemini' && !health.gemini?.configured) text = 'No Gemini key yet. Add GEMINI_API_KEY to helper/.env and restart the helper.';
  else if (health && !health.demo && provider === 'claude' && !health.claude?.configured) text = 'No Claude key yet. Add ANTHROPIC_API_KEY to helper/.env and restart the helper, or switch to Gemini.';
  else if (health && !health.demo && health.tools && !health.tools.ytdlp?.found) text = 'yt-dlp is not installed, so reels cannot be downloaded. See Setup in Settings.';
  if (!text) return null;
  return (
    <div className="mx-6 flex gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Selection({ queue }: { queue: Reel[] }) {
  const { start, starting, error, health, healthError, provider, setProvider } = useBatch();
  const [range, setRange] = useState<Range>('all');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const visible = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days;
    const cutoff = days ? Date.now() - days * 86400000 : null;
    return queue
      .filter((r) => !cutoff || (r.savedAt ? new Date(r.savedAt).getTime() >= cutoff : new Date(r.importedAt).getTime() >= cutoff))
      .sort((a, b) => (b.savedAt || b.importedAt).localeCompare(a.savedAt || a.importedAt));
  }, [queue, range]);

  const selected = visible.filter((r) => !deselected.has(r.shortcode));
  const all = selected.length === visible.length;
  const none = selected.length === 0;
  const keyOk = Boolean(health && !health.needsCode && (health.demo || (provider === 'claude' ? health.claude?.configured : health.gemini?.configured)));
  const blocked = Boolean(healthError) || !health || health.needsCode || !keyOk || (!health.demo && !health.tools?.ytdlp.found);

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <header className="flex flex-col gap-1 px-6 pb-4 pt-6">
        <SheetTitle className="text-lg font-semibold tracking-[-0.01em]">Analyze queue</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {queue.length ? `${plural(queue.length, 'reel')} not analyzed yet. Reels you've already analyzed are never sent again.` : 'Nothing waiting. Add saved reels to fill the queue.'}
        </SheetDescription>
      </header>
      <HelperWarning />
      {queue.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 px-6 pb-3 pt-4">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={cn('rounded-full border px-3 py-1 text-[13px]', range === r.id ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 border-y bg-muted/60 px-6 py-2 text-[13px]">
            <Checkbox
              checked={all ? true : none ? false : 'indeterminate'}
              onCheckedChange={() => setDeselected(all ? new Set(visible.map((r) => r.shortcode)) : new Set())}
              aria-label="Select all"
            />
            <span className="text-muted-foreground">
              {selected.length} of {visible.length} selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              className={cn('ml-auto h-7 px-2', confirmRemove ? 'text-destructive' : 'text-muted-foreground')}
              disabled={none}
              onClick={async () => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  setTimeout(() => setConfirmRemove(false), 4000);
                  return;
                }
                const n = await removeQueued(selected.map((r) => r.shortcode));
                setConfirmRemove(false);
                setDeselected(new Set());
                setNote(`Removed ${plural(n, 'link')}.`);
              }}
              title="Remove the selected links from ReelMind. Analyzed reels are never removed here."
            >
              <Trash2 /> {confirmRemove ? `Click again to remove ${selected.length}` : all && visible.length === queue.length ? 'Clear all' : 'Remove'}
            </Button>
          </div>
          {note && <p className="border-b bg-success/10 px-6 py-1.5 text-[12.5px] text-success">{note}</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((r) => (
              <li key={r.shortcode} className="flex items-start gap-3 border-b px-6 py-2.5">
                <Checkbox className="mt-0.5" checked={!deselected.has(r.shortcode)} onCheckedChange={() => toggle(r.shortcode)} aria-label={`Select ${r.shortcode}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-medium">{r.creator ? `@${r.creator}` : r.shortcode}</span>
                    {r.status === 'failed' ? (
                      <Badge variant="failed">Failed before</Badge>
                    ) : r.queued ? (
                      <Badge variant="outline">
                        <Clock className="size-3" /> Waiting for computer
                      </Badge>
                    ) : (
                      <Badge variant="new">New</Badge>
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">{r.savedAt ? `Saved ${relativeDay(r.savedAt).toLowerCase()}` : `Added ${relativeDay(r.importedAt).toLowerCase()}`}</p>
                  {r.failReason && <p className="mt-0.5 text-[12.5px] text-destructive">{r.failReason}</p>}
                </div>
                <a href={r.url} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open on Instagram">
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
            {!visible.length && <li className="px-6 py-8 text-center text-sm text-muted-foreground">No reels saved in this period.</li>}
          </ul>
          <footer className="flex flex-col gap-2 border-t px-6 py-4">
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            {health && !health.demo && health.claude?.configured && (
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="text-muted-foreground">Analyze with</span>
                {(['gemini', 'claude'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={cn('rounded-full border px-2.5 py-0.5', provider === p ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
                    title={p === 'gemini' ? 'Watches the video and hears the speech' : 'Reads still frames and the caption; cannot hear audio'}
                  >
                    {p === 'gemini' ? 'Gemini, watches video' : 'Claude, reads frames'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="flex-1 text-[12.5px] leading-snug text-muted-foreground">
                {health?.demo
                  ? 'Demo mode: sample results, no downloads or AI calls.'
                  : `About ${plural(selected.length, 'AI call')} on ${provider === 'claude' ? health?.claude?.model || 'Claude' : health?.gemini?.model || 'Gemini'}.`}
              </p>
              {(healthError && !health) || health?.needsCode ? (
                <Button
                  variant="highlight"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={none}
                  onClick={async () => {
                    await queueForLater(selected.map((r) => r.shortcode));
                    setNote(`${plural(selected.length, 'reel')} will be analyzed when your computer's helper is online.`);
                  }}
                >
                  <Clock /> Analyze when my computer is online
                </Button>
              ) : (
                <Button variant="highlight" size="lg" className="w-full sm:w-auto" disabled={none || starting || Boolean(blocked)} onClick={() => start(selected)}>
                  {starting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Analyze {plural(selected.length, 'reel')}
                </Button>
              )}
            </div>
          </footer>
        </>
      )}
    </>
  );
}

const STEP: Record<JobStep, { label: string; variant: 'default' | 'new' | 'done' | 'failed' | 'ink' | 'outline' }> = {
  queued: { label: 'Waiting', variant: 'outline' },
  pending: { label: 'Not started', variant: 'outline' },
  fetching: { label: 'Downloading', variant: 'ink' },
  analyzing: { label: 'Analyzing', variant: 'ink' },
  done: { label: 'Analyzed', variant: 'done' },
  cached: { label: 'Reused, free', variant: 'default' },
  failed: { label: 'Failed', variant: 'failed' },
};

function Progress_({ job, onClose }: { job: Job; onClose: () => void }) {
  const { cancel, dismiss, error } = useBatch();
  const c = job.counts;
  const finished = c.done + c.cached + c.failed;
  const running = job.status === 'running';
  const linking = job.kind === 'link';
  const title = running
    ? `${linking ? 'Linking' : 'Analyzing'} ${Math.min(finished + 1, c.total)} of ${c.total}`
    : job.status === 'done'
      ? 'Batch finished'
      : job.status === 'rate_limited'
        ? 'Paused at the Gemini limit'
        : job.status === 'cancelled'
          ? 'Batch cancelled'
          : 'Batch stopped';

  return (
    <>
      <header className="flex flex-col gap-3 px-6 pb-4 pt-6">
        <div>
          <SheetTitle className="text-lg font-semibold tracking-[-0.01em]">{title}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {running ? 'You can keep using the board. New cards appear as each reel finishes.' : 'Unfinished reels stay in your queue. Nothing is charged twice.'}
          </SheetDescription>
        </div>
        <Progress value={(finished / Math.max(1, c.total)) * 100} />
        <dl className="grid grid-cols-4 gap-2 text-center">
          <Count label={linking ? 'Linked' : 'Analyzed'} value={c.done} />
          <Count label={linking ? 'Already linked' : 'Reused'} value={c.cached} />
          <Count label="Failed" value={c.failed} />
          <Count label="Waiting" value={c.pending + c.active} />
        </dl>
        {(job.message || error) && !running && <p className="rounded-md bg-muted px-3 py-2 text-[13px]">{job.message || error}</p>}
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto border-t">
        {job.items.map((item) => (
          <li key={item.shortcode} className="flex items-start gap-3 border-b px-6 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.creator ? `@${item.creator}` : item.shortcode}</p>
              {item.error && <p className="text-[12.5px] text-destructive">{item.error}</p>}
            </div>
            <Badge variant={STEP[item.step].variant}>
              {(item.step === 'fetching' || item.step === 'analyzing') && <Loader2 className="size-3 animate-spin" />}
              {STEP[item.step].label}
            </Badge>
          </li>
        ))}
      </ul>
      <footer className="flex justify-end gap-2 border-t px-6 py-4">
        {running ? (
          <Button variant="outline" onClick={cancel}>
            Cancel batch
          </Button>
        ) : (
          <Button
            onClick={() => {
              dismiss();
              onClose();
            }}
          >
            View on board
          </Button>
        )}
      </footer>
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted py-2">
      <dd className="text-lg font-semibold leading-tight">{value}</dd>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
    </div>
  );
}
