// Search and filters. Matching reels stay bright; everything else on the board fades back.
import { Box, Search, Workflow, X } from 'lucide-react';
import { CONTENT_MOODS } from '@/lib/emotion';
import type { Analysis, Reel } from '@/lib/types';
import { cn, plural } from '@/lib/utils';

export interface Filters {
  query: string;
  kind: string;
  practice: 'all' | 'todo' | 'done';
  newOnly: boolean;
}

export const NO_FILTERS: Filters = { query: '', kind: 'all', practice: 'all', newOnly: false };

export function isFiltering(f: Filters) {
  return Boolean(f.query.trim()) || f.kind !== 'all' || f.practice !== 'all' || f.newOnly;
}

export function matchReels(items: { reel: Reel; analysis: Analysis }[], f: Filters, lastBatchId: string | null): Set<string> | null {
  if (!isFiltering(f)) return null;
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const { reel, analysis: a } of items) {
    if (f.kind !== 'all' && a.contentType !== f.kind) continue;
    if (f.practice === 'todo' && reel.practiceDone) continue;
    if (f.practice === 'done' && !reel.practiceDone) continue;
    if (f.newOnly && (!lastBatchId || reel.batchId !== lastBatchId)) continue;
    if (words.length) {
      const hay = [a.title, a.summary, ...a.keyPoints, ...a.topics, ...a.tools.map((t) => t.name), reel.creator, a.transcript, a.onScreenText, a.practiceTask.title]
        .join(' ')
        .toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.add(reel.shortcode);
  }
  return out;
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors', active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted')}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

export type BoardView = 'workflow' | '3d';

export function FilterBar({
  filters,
  onChange,
  kinds,
  matched,
  total,
  view,
  onView,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  kinds: string[];
  matched: number | null;
  total: number;
  view: BoardView;
  onView: (v: BoardView) => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-background/80 px-3 backdrop-blur sm:px-4">
      <div className="flex shrink-0 rounded-full border bg-muted p-0.5" role="group" aria-label="Board view">
        {(
          [
            ['workflow', 'Workflow', Workflow],
            ['3d', '3D', Box],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => onView(id)}
            aria-pressed={view === id}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium', view === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      <label className="relative flex shrink-0 items-center">
        <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
        <span className="sr-only">Search your reels</span>
        <input
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search titles, transcripts, tools…"
          className="h-8 w-56 rounded-full border border-input bg-background pl-8 pr-3 text-[13px] placeholder:text-muted-foreground/70 sm:w-72"
        />
      </label>
      {kinds.map((k) => {
        const mood = CONTENT_MOODS[k] || CONTENT_MOODS.other;
        return (
          <Chip key={k} active={filters.kind === k} onClick={() => set({ kind: filters.kind === k ? 'all' : k })} color={mood.color}>
            {mood.label}
          </Chip>
        );
      })}
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <Chip active={filters.practice === 'todo'} onClick={() => set({ practice: filters.practice === 'todo' ? 'all' : 'todo' })}>
        To practise
      </Chip>
      <Chip active={filters.practice === 'done'} onClick={() => set({ practice: filters.practice === 'done' ? 'all' : 'done' })}>
        Practised
      </Chip>
      <Chip active={filters.newOnly} onClick={() => set({ newOnly: !filters.newOnly })} color="#facc15">
        New this batch
      </Chip>
      {matched !== null && (
        <>
          <span className="ml-1 shrink-0 text-[12.5px] text-muted-foreground">
            {matched} of {plural(total, 'reel')}
          </span>
          <button onClick={() => onChange({ ...filters, query: '', kind: 'all', practice: 'all', newOnly: false })} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12.5px] hover:bg-muted">
            <X className="size-3.5" /> Clear
          </button>
        </>
      )}
    </div>
  );
}
