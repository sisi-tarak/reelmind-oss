// One place to take your notes out: a summary of any length, files in any format, or a share card or link.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Copy, Download, FileImage, FileSpreadsheet, FileText, FileType, Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { captureBoard, dataUrlToBlob, downloadBlob, fileStamp, slug } from '@/lib/capture';
import { db } from '@/lib/db';
import { exportMarkdown } from '@/lib/export';
import { buildSummary, DEFAULT_SUMMARY, type SummaryLength, type SummaryOptions } from '@/lib/summary';
import { topicLabel } from '@/lib/topics';
import type { Link } from '@/lib/types';
import { cn, plural } from '@/lib/utils';
import type { CanvasItem } from './canvas';
import { ShareImage, ShareLink } from './share-panel';

export type ExportScope = { kind: 'all' } | { kind: 'filtered' } | { kind: 'topic'; topic: string } | { kind: 'reel'; id: string };
type Tab = 'summary' | 'download' | 'share';

const LENGTHS: { id: SummaryLength; label: string }[] = [
  { id: 'line', label: '1 line' },
  { id: 'short', label: '2 to 3 lines' },
  { id: 'paragraph', label: 'Paragraph' },
  { id: 'full', label: 'Full notes' },
];

const SECTIONS: { id: keyof SummaryOptions['sections']; label: string }[] = [
  { id: 'recap', label: 'Topic recap' },
  { id: 'takeaways', label: 'Top takeaways' },
  { id: 'actions', label: 'What to practise' },
  { id: 'tools', label: 'Tools and links' },
];

function readOptions(): SummaryOptions {
  try {
    const saved = JSON.parse(localStorage.getItem('reelmind.summary') || 'null');
    return saved ? { ...DEFAULT_SUMMARY, ...saved, sections: { ...DEFAULT_SUMMARY.sections, ...saved.sections } } : DEFAULT_SUMMARY;
  } catch {
    return DEFAULT_SUMMARY;
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn('rounded-full border px-3 py-1 text-[13px]', active ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
      {children}
    </button>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  items,
  links,
  match,
  filterLabel,
  initialScope,
  initialTab = 'summary',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CanvasItem[];
  links: Link[];
  match: Set<string> | null;
  filterLabel: string;
  initialScope: ExportScope;
  initialTab?: Tab;
}) {
  const [scope, setScope] = useState<ExportScope>(initialScope);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [opts, setOpts] = useState<SummaryOptions>(readOptions);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const boards = useLiveQuery(() => db.topicBoards.toArray(), [], []);

  // Start from what was asked for each time the dialog opens; after that, the person's picks stick.
  useEffect(() => {
    if (open) {
      setScope(initialScope);
      setTab(initialTab);
      setNote(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem('reelmind.summary', JSON.stringify(opts));
    } catch {
      /* preference just won't persist */
    }
  }, [opts]);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.analysis.primaryTopic, (counts.get(i.analysis.primaryTopic) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const { selected, title, kind } = useMemo(() => {
    if (scope.kind === 'filtered' && match) return { selected: items.filter((i) => match.has(i.reel.shortcode)), title: filterLabel, kind: 'summary' as const };
    if (scope.kind === 'topic') return { selected: items.filter((i) => i.analysis.primaryTopic === scope.topic), title: topicLabel(scope.topic), kind: 'topic' as const };
    if (scope.kind === 'reel') {
      const one = items.filter((i) => i.reel.shortcode === scope.id);
      return { selected: one, title: one[0]?.analysis.title || 'Reel', kind: 'reel' as const };
    }
    return { selected: items, title: 'My saved reels', kind: 'summary' as const };
  }, [scope, items, match, filterLabel]);

  const board = scope.kind === 'topic' ? boards.find((b) => b.topic === scope.topic) : undefined;
  const summary = useMemo(() => buildSummary(selected, opts, title), [selected, opts, title]);
  const scopeLinks = useMemo(() => {
    const ids = new Set(selected.map((i) => i.reel.shortcode));
    return links.filter((l) => ids.has(l.a) && ids.has(l.b));
  }, [selected, links]);
  const base = `reelmind-${slug(title)}-${fileStamp()}`;
  const reelIds = scope.kind === 'all' ? undefined : new Set(selected.map((i) => i.reel.shortcode));

  const run = async (id: string, job: () => Promise<void>) => {
    setBusy(id);
    setNote(null);
    try {
      await job();
    } catch (e) {
      setNote((e as Error).message || 'That export failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const boardPicture = async (format: 'png' | 'jpeg') => {
    try {
      return await captureBoard({ reelIds, format, clean: scope.kind !== 'filtered' });
    } catch {
      return null;
    }
  };

  const fileInput = async () => ({
    title,
    items: selected,
    links: scopeLinks,
    boards: board ? [board] : scope.kind === 'all' || scope.kind === 'filtered' ? boards : [],
    // Files list every reel with its own links, so the summary at the top stays clean.
    summary: buildSummary(selected, { ...opts, length: opts.length === 'full' ? 'paragraph' : opts.length, format: 'text', withLinks: false }, title),
    boardImage: scope.kind === 'reel' ? null : await boardPicture('jpeg'),
  });

  const formats = [
    {
      id: 'png',
      icon: FileImage,
      name: 'Board picture, PNG',
      detail: 'The board as it looks now, cropped to this selection. Sharp, for slides and docs.',
      go: async () => {
        const url = await boardPicture('png');
        if (!url) throw new Error('Open the board first: close any panel covering it, then try again.');
        downloadBlob(dataUrlToBlob(url), `${base}.png`);
      },
    },
    {
      id: 'jpg',
      icon: FileImage,
      name: 'Board picture, JPG',
      detail: 'Smaller file, good for WhatsApp and email.',
      go: async () => {
        const url = await boardPicture('jpeg');
        if (!url) throw new Error('Open the board first: close any panel covering it, then try again.');
        downloadBlob(dataUrlToBlob(url), `${base}.jpg`);
      },
    },
    {
      id: 'pdf',
      icon: FileText,
      name: 'PDF study guide',
      detail: 'Summary, board picture, then every reel with notes, practice and clickable links. Print-ready A4.',
      go: async () => {
        const { exportPdf } = await import('@/lib/exporters');
        downloadBlob(await exportPdf(await fileInput()), `${base}.pdf`);
      },
    },
    {
      id: 'docx',
      icon: FileType,
      name: 'Word document',
      detail: 'The same guide as an editable .docx with headings and links.',
      go: async () => {
        const { exportDocx } = await import('@/lib/exporters');
        downloadBlob(await exportDocx(await fileInput()), `${base}.docx`);
      },
    },
    {
      id: 'xlsx',
      icon: FileSpreadsheet,
      name: 'Excel workbook',
      detail: 'Sheets for reels, topics, tools, a practice plan and connections. Sort, filter, track.',
      go: async () => {
        const { exportXlsx } = await import('@/lib/exporters');
        downloadBlob(await exportXlsx(await fileInput()), `${base}.xlsx`);
      },
    },
    {
      id: 'md',
      icon: NotebookPen,
      name: 'Markdown for Obsidian or Notion',
      detail: 'One note per reel and topic, linked together, in a ZIP.',
      go: async () => downloadBlob(await exportMarkdown(selected, scopeLinks, boards), `${base}-notes.zip`),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Export and share</DialogTitle>
          <DialogDescription>Pick what to include, then copy a summary, download a file, or share it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-muted-foreground">Include</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })}>
              Everything ({items.length})
            </Chip>
            {match && (
              <Chip active={scope.kind === 'filtered'} onClick={() => setScope({ kind: 'filtered' })}>
                Current search ({match.size})
              </Chip>
            )}
            <select
              value={scope.kind === 'topic' ? scope.topic : ''}
              onChange={(e) => e.target.value && setScope({ kind: 'topic', topic: e.target.value })}
              className={cn('h-[30px] rounded-full border px-3 text-[13px]', scope.kind === 'topic' ? 'border-foreground bg-foreground text-background' : 'bg-background')}
              aria-label="One topic"
            >
              <option value="">One topic…</option>
              {topics.map(([t, n]) => (
                <option key={t} value={t}>
                  {topicLabel(t)} ({n})
                </option>
              ))}
            </select>
            {initialScope.kind === 'reel' && (
              <Chip active={scope.kind === 'reel'} onClick={() => setScope(initialScope)}>
                This reel
              </Chip>
            )}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {plural(selected.length, 'reel')} selected: <span className="font-medium text-foreground">{title}</span>
          </p>
        </div>

        <div className="flex gap-1 border-b">
          {(['summary', 'download', 'share'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium', tab === t ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t === 'summary' ? 'Summary' : t === 'download' ? 'Download' : 'Share'}
            </button>
          ))}
        </div>

        {tab === 'summary' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {LENGTHS.map((l) => (
                <Chip key={l.id} active={opts.length === l.id} onClick={() => setOpts({ ...opts, length: l.id })}>
                  {l.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
              {SECTIONS.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <Checkbox checked={opts.sections[s.id]} onCheckedChange={(v) => setOpts({ ...opts, sections: { ...opts.sections, [s.id]: v === true } })} />
                  {s.label}
                </label>
              ))}
              <label className="flex items-center gap-2">
                <Checkbox checked={opts.withLinks} onCheckedChange={(v) => setOpts({ ...opts, withLinks: v === true })} />
                Include reel links
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={opts.format === 'markdown'} onCheckedChange={(v) => setOpts({ ...opts, format: v === true ? 'markdown' : 'text' })} />
                Markdown
              </label>
            </div>
            <textarea readOnly value={summary} className="h-56 w-full resize-y rounded-lg border bg-muted/50 p-3 font-mono text-[12.5px] leading-relaxed" aria-label="Summary preview" />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(summary);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy summary'}
              </Button>
              <Button variant="outline" onClick={() => downloadBlob(new Blob([summary], { type: 'text/plain;charset=utf-8' }), `${base}-summary.${opts.format === 'markdown' ? 'md' : 'txt'}`)}>
                <Download /> Download .{opts.format === 'markdown' ? 'md' : 'txt'}
              </Button>
              <span className="text-[12px] text-muted-foreground">Made from your notes, no AI call.</span>
            </div>
          </div>
        )}

        {tab === 'download' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {formats.map((f) => {
              const disabled = Boolean(busy) || ((f.id === 'png' || f.id === 'jpg') && scope.kind === 'reel');
              return (
                <button
                  key={f.id}
                  disabled={disabled}
                  onClick={() => run(f.id, f.go)}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-45"
                >
                  {busy === f.id ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" /> : <f.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  <span>
                    <span className="block text-[14px] font-semibold">{f.name}</span>
                    <span className="block text-[12.5px] leading-snug text-muted-foreground">{(f.id === 'png' || f.id === 'jpg') && scope.kind === 'reel' ? 'For one reel, use Share for an image card.' : f.detail}</span>
                  </span>
                </button>
              );
            })}
            {note && <p className="text-[13px] text-destructive sm:col-span-2">{note}</p>}
          </div>
        )}

        {tab === 'share' && (
          <div className="flex flex-col gap-5">
            <ShareImage key={`img-${title}-${selected.length}`} content={{ kind, title, items: selected, board }} />
            <div className="border-t pt-4">
              <h3 className="mb-2 text-[14px] font-semibold">Share link</h3>
              <ShareLink key={`link-${title}-${selected.length}`} content={{ kind, title, items: selected, board }} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
