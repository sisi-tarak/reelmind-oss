// A strip of days along the bottom of the board: when you saved what.
// Each dot is a reel in its content colour; click one to jump to it on the board.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { moodFor } from '@/lib/emotion';
import { localDay } from '@/lib/week';
import { cn } from '@/lib/utils';
import type { CanvasItem } from './canvas';

const MAX_DAYS = 56;
const MAX_DOTS = 6;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Timeline({ items, match, onPick }: { items: CanvasItem[]; match: Set<string> | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('reelmind.timeline') !== 'closed';
    } catch {
      return true;
    }
  });
  const scroller = useRef<HTMLDivElement>(null);

  const { days, byDay, hidden } = useMemo(() => {
    const byDay = new Map<string, CanvasItem[]>();
    let earliest = Date.now();
    for (const it of items) {
      const when = it.reel.savedAt || it.analysis.analyzedAt;
      const key = localDay(new Date(when));
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(it);
      earliest = Math.min(earliest, new Date(when).getTime());
    }
    const today = new Date();
    const span = Math.min(MAX_DAYS, Math.max(14, Math.ceil((today.getTime() - earliest) / 86400000) + 1));
    const days: Date[] = [];
    for (let i = span - 1; i >= 0; i--) days.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    const shown = new Set(days.map(localDay));
    const hidden = [...byDay.entries()].filter(([k]) => !shown.has(k)).reduce((n, [, l]) => n + l.length, 0);
    return { days, byDay, hidden };
  }, [items]);

  useEffect(() => {
    if (open && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [open, days.length]);

  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem('reelmind.timeline', v ? 'closed' : 'open');
      } catch {
        /* preference just won't persist */
      }
      return !v;
    });

  const todayKey = localDay(new Date());

  return (
    <div className="shrink-0 border-t bg-background">
      <button onClick={toggle} className="flex h-9 w-full items-center gap-2 px-4 text-[13px] font-semibold" aria-expanded={open}>
        <CalendarDays className="size-4 text-muted-foreground" />
        Timeline
        <span className="font-normal text-muted-foreground">by the day you saved each reel{hidden ? `, ${hidden} older not shown` : ''}</span>
        <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div ref={scroller} className="overflow-x-auto px-4 pb-3">
          <div className="flex min-w-max items-end">
            {days.map((d) => {
              const key = localDay(d);
              const list = byDay.get(key) || [];
              const monday = d.getDay() === 1;
              const firstOfMonth = d.getDate() === 1;
              return (
                <div key={key} className={cn('flex w-9 flex-col items-center gap-1', monday && 'border-l border-dashed border-border')}>
                  <div className="flex h-[62px] flex-col-reverse items-center gap-[3px] pb-1">
                    {list.slice(0, MAX_DOTS).map((it) => {
                      const mood = moodFor(it.analysis.contentType);
                      const dim = match && !match.has(it.reel.shortcode);
                      return (
                        <button
                          key={it.reel.shortcode}
                          onClick={() => onPick(it.reel.shortcode)}
                          title={`${it.analysis.title} (${mood.label})`}
                          aria-label={it.analysis.title}
                          className={cn('size-[9px] rounded-full ring-offset-1 transition hover:scale-150 focus-visible:ring-2', dim && 'opacity-20')}
                          style={{ background: mood.color }}
                        />
                      );
                    })}
                    {list.length > MAX_DOTS && <span className="text-[10px] leading-none text-muted-foreground">+{list.length - MAX_DOTS}</span>}
                  </div>
                  <span className={cn('text-[10.5px] leading-none', key === todayKey ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{WEEKDAY[d.getDay()]}</span>
                  <span className={cn('text-[11px] leading-none tabular-nums', key === todayKey ? 'rounded bg-foreground px-1 py-0.5 font-semibold text-background' : list.length ? 'font-medium' : 'text-muted-foreground')}>
                    {firstOfMonth || key === localDay(days[0]) ? `${d.getDate()} ${MONTH[d.getMonth()]}` : d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
