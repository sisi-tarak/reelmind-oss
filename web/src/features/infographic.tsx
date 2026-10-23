// Draws a reel's one-glance visual from the structured data the AI returns.
// Drawn as HTML, not generated as an image: always sharp, consistent and free.
import { Check } from 'lucide-react';
import type { Infographic as Data } from '@/lib/types';
import { cn } from '@/lib/utils';

export function Infographic({ data, compact = false, accent }: { data: Data; compact?: boolean; accent: string }) {
  const layout = data.layout === 'comparison' && data.columns.length < 2 ? 'checklist' : data.layout;
  const items = data.items.length ? data.items : data.rows.map((r) => ({ label: r.aspect, detail: r.values.join(' / ') }));
  if (layout === 'steps') return <Steps items={items} compact={compact} accent={accent} />;
  if (layout === 'comparison') return <Comparison data={data} compact={compact} accent={accent} />;
  if (layout === 'concept') return <Concept center={data.center || data.headline} items={items} compact={compact} accent={accent} />;
  return <Checklist items={items} compact={compact} accent={accent} />;
}

type Item = { label: string; detail: string };

function Steps({ items, compact, accent }: { items: Item[]; compact: boolean; accent: string }) {
  if (compact) {
    const shown = items.slice(0, 4);
    return (
      <div className="flex h-full items-center px-3">
        {shown.map((item, i) => (
          <div key={i} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: accent }}>
                {i + 1}
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight">{item.label}</span>
            </div>
            {i < shown.length - 1 && <span className="mx-1 mb-6 h-px min-w-3 flex-1" style={{ background: accent, opacity: 0.4 }} />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <ol className="relative flex flex-col gap-4">
      <span className="absolute bottom-3 left-[13px] top-3 w-px" style={{ background: accent, opacity: 0.35 }} aria-hidden />
      {items.map((item, i) => (
        <li key={i} className="relative flex gap-3">
          <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: accent }}>
            {i + 1}
          </span>
          <div className="pt-0.5">
            <p className="text-sm font-semibold leading-snug">{item.label}</p>
            {item.detail && <p className="text-[13px] leading-snug text-muted-foreground">{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Comparison({ data, compact, accent }: { data: Data; compact: boolean; accent: string }) {
  const cols = data.columns.slice(0, 3);
  const rows = compact ? data.rows.slice(0, 2) : data.rows;
  return (
    <div className={cn('overflow-hidden', compact ? 'h-full px-3 py-2.5' : 'rounded-lg border')}>
      <table className={cn('w-full table-fixed border-collapse', compact ? 'text-[10.5px]' : 'text-[13px]')}>
        <thead>
          <tr>
            <th className={cn('text-left font-normal text-muted-foreground', compact ? 'w-[28%] pb-1' : 'w-[26%] bg-muted px-3 py-2')} />
            {cols.map((c, i) => (
              <th key={i} className={cn('text-left font-semibold', compact ? 'truncate pb-1' : 'bg-muted px-3 py-2')} style={{ color: accent }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/70 align-top">
              <td className={cn('font-medium text-muted-foreground', compact ? 'truncate py-1 pr-1' : 'px-3 py-2')}>{r.aspect}</td>
              {cols.map((_, j) => (
                <td key={j} className={cn(compact ? 'truncate py-1 pr-1' : 'px-3 py-2 leading-snug')}>
                  {r.values[j] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Concept({ center, items, compact, accent }: { center: string; items: Item[]; compact: boolean; accent: string }) {
  if (compact) {
    const shown = items.slice(0, 4);
    return (
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-3">
        <div className="flex flex-col gap-1.5">
          {shown.slice(0, 2).map((item, i) => (
            <span key={i} className="truncate rounded border bg-background px-1.5 py-0.5 text-right text-[10.5px]">
              {item.label}
            </span>
          ))}
        </div>
        <span className="max-w-24 rounded-md px-2 py-1.5 text-center text-[11px] font-semibold leading-tight text-white" style={{ background: accent }}>
          {center}
        </span>
        <div className="flex flex-col gap-1.5">
          {shown.slice(2, 4).map((item, i) => (
            <span key={i} className="truncate rounded border bg-background px-1.5 py-0.5 text-[10.5px]">
              {item.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="rounded-lg px-4 py-2 text-center text-[15px] font-semibold text-white" style={{ background: accent }}>
        {center}
      </span>
      <span className="h-3 w-px" style={{ background: accent, opacity: 0.4 }} aria-hidden />
      <div className="grid w-full grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border bg-background p-3" style={{ borderTopColor: accent, borderTopWidth: 2 }}>
            <p className="text-sm font-semibold leading-snug">{item.label}</p>
            {item.detail && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{item.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Checklist({ items, compact, accent }: { items: Item[]; compact: boolean; accent: string }) {
  const shown = compact ? items.slice(0, 3) : items;
  return (
    <ul className={cn('flex flex-col', compact ? 'h-full justify-center gap-1 px-3' : 'gap-3')}>
      {shown.map((item, i) => (
        <li key={i} className="flex min-w-0 items-start gap-2">
          <span className={cn('mt-0.5 flex shrink-0 items-center justify-center rounded-full', compact ? 'size-3.5' : 'size-5')} style={{ background: accent }}>
            <Check className={cn('text-white', compact ? 'size-2.5' : 'size-3')} strokeWidth={3} />
          </span>
          {compact ? (
            <span className="truncate text-[11px] leading-[14px]">
              <span className="font-semibold">{item.label}</span>
              {item.detail && <span className="text-muted-foreground"> {item.detail}</span>}
            </span>
          ) : (
            <div>
              <p className="text-sm font-semibold leading-snug">{item.label}</p>
              {item.detail && <p className="text-[13px] leading-snug text-muted-foreground">{item.detail}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
