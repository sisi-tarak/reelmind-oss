import { ExternalLink, ImageOff, Loader2, NotebookText, Play } from 'lucide-react';
import { moodFor } from '@/lib/emotion';
import { useThumb } from '@/lib/thumbs';
import { topicLabel } from '@/lib/topics';
import type { Analysis, Reel } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { SAMPLE_COLLECTION } from '@/lib/db';
import { useBatch } from './batch';

function duration(sec: number | null) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** The reel's cover, or a coloured placeholder when there isn't one. */
export function ReelThumb({ reel, analysis, show, className, compact }: { reel: Reel; analysis: Analysis; show: boolean; className?: string; compact?: boolean }) {
  const { ready } = useBatch();
  const sample = reel.collections?.includes(SAMPLE_COLLECTION) || analysis.provider === 'demo';
  const { url, loading } = useThumb(reel.shortcode, show && !sample, ready && analysis.hasThumb);
  const mood = moodFor(analysis.contentType);
  const Icon = mood.icon;
  const time = duration(analysis.durationSec);
  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={{ background: mood.tint }}>
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          {loading ? (
            <Loader2 className="size-5 animate-spin" style={{ color: mood.color }} />
          ) : (
            <>
              <Icon className="size-8" style={{ color: mood.color }} strokeWidth={1.5} />
              <span className={`items-center gap-1 px-3 text-[11px] text-muted-foreground ${compact ? 'hidden' : 'flex'}`}>
                {sample ? 'Sample reel, no cover' : !analysis.hasThumb ? 'No cover saved' : ready ? (
                  <>
                    <ImageOff className="size-3" /> Cover not found
                  </>
                ) : (
                  'Start the helper to see the cover'
                )}
              </span>
            </>
          )}
        </div>
      )}
      {url && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </span>
      )}
      {time && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium text-white">{time}</span>}
    </div>
  );
}

/** Shown above a reel tile on hover: cover, title, creator and the quick facts. */
export function ReelHoverCard({ reel, analysis, onOpen }: { reel: Reel; analysis: Analysis; onOpen: () => void }) {
  const mood = moodFor(analysis.contentType);
  return (
    <div className="nodrag nopan w-[264px] overflow-hidden rounded-xl border bg-background text-left shadow-[0_18px_44px_-16px_rgb(16_24_40/0.45)]">
      <a href={reel.url} target="_blank" rel="noreferrer" className="block" title="Watch on Instagram">
        <ReelThumb reel={reel} analysis={analysis} show className="aspect-[4/5] max-h-[260px] w-full" />
      </a>
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          <span className="rounded-full px-2 py-0.5 text-white" style={{ background: mood.color }}>
            {mood.label}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{topicLabel(analysis.primaryTopic)}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 capitalize text-muted-foreground">{analysis.difficulty}</span>
        </div>
        <p className="mt-2 text-[13.5px] font-semibold leading-snug">{analysis.title}</p>
        <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-muted-foreground">{analysis.summary}</p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {reel.creator ? `@${reel.creator}` : 'Unknown creator'}
          {reel.savedAt ? ` · saved ${formatDate(reel.savedAt)}` : ''}
          {analysis.tools.length ? ` · ${analysis.tools.length} ${analysis.tools.length === 1 ? 'tool' : 'tools'}` : ''}
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={onOpen} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[12.5px] font-medium text-background hover:opacity-90">
            <NotebookText className="size-3.5" /> Open notes
          </button>
          <a href={reel.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-muted">
            <ExternalLink className="size-3.5" /> Instagram
          </a>
        </div>
      </div>
    </div>
  );
}
