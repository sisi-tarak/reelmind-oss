import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrainCircuit, CalendarCheck, History, Library, ChevronDown, Download, Inbox, Loader2, Plus, Settings, Sparkles, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { computeLinks, linksOf, type LinkLevel } from '@/lib/links';
import { loadSample } from '@/lib/sample';
import { LINKS } from '@/lib/site';
import type { Analysis, Reel } from '@/lib/types';
import { cn, plural } from '@/lib/utils';
import { useBatch } from '@/features/batch';
import { Canvas, type CanvasItem } from '@/features/canvas';
import { DigestSheet } from '@/features/digest-sheet';
import { ExportDialog, type ExportScope } from '@/features/export-dialog';
import { FilterBar, matchReels, NO_FILTERS, type BoardView, type Filters } from '@/features/filter-bar';
import { ImportDialog } from '@/features/import-dialog';
import { QueueSheet } from '@/features/queue-sheet';
import { HistoryDialog } from '@/features/history-dialog';
import { LibraryDialog } from '@/features/library-dialog';
import { HISTORY_EVENT } from '@/lib/history';
import type { GenerationKind } from '@/lib/types';
import { ReelSheet } from '@/features/reel-sheet';
import { ReviewDialog, useReviewCount } from '@/features/review-dialog';
import { SettingsDialog, SetupSteps } from '@/features/settings-dialog';
import { Timeline } from '@/features/timeline';
import { TopicSheet } from '@/features/topic-sheet';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--foreground)" />
        <rect x="7" y="8" width="10" height="16" rx="2.5" fill="none" stroke="var(--highlight)" strokeWidth="2" />
        <circle cx="23" cy="11" r="2.5" fill="var(--highlight)" />
        <circle cx="23" cy="21" r="2.5" fill="#fff" />
        <path d="M17 13.5 20.8 11.6M17 18.5l3.8 1.9" stroke="#fff" strokeWidth="1.6" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">ReelMind</span>
    </div>
  );
}

function HelperPill({ onClick }: { onClick: () => void }) {
  const { health, healthError, browserBlocked } = useBatch();
  const state = browserBlocked ? 'blocked' : healthError || !health ? 'off' : health.needsCode ? 'code' : health.demo ? 'demo' : (health.gemini?.configured || health.claude?.configured) && health.tools?.ytdlp?.found ? 'ok' : 'setup';
  const label = { blocked: 'Allow local access', off: 'Helper offline', code: 'Connect helper', demo: 'Demo mode', ok: 'Helper ready', setup: 'Finish setup' }[state];
  const dot = { blocked: 'bg-destructive', off: 'bg-destructive', code: 'bg-highlight', demo: 'bg-highlight', ok: 'bg-success', setup: 'bg-highlight' }[state];
  return (
    <button onClick={onClick} className="hidden items-center gap-2 whitespace-nowrap rounded-full border bg-background px-3 py-1 text-[13px] hover:bg-muted md:flex">
      <span className={cn('size-2 rounded-full', dot)} />
      {label}
    </button>
  );
}

function Notice() {
  const { notice, setNotice } = useBatch();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  if (!notice) return null;
  return (
    <div role="status" className="fixed bottom-16 left-1/2 z-50 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2.5 rounded-full border bg-foreground py-2 pl-4 pr-2 text-[13.5px] text-background shadow-lg">
      <Inbox className="size-4 shrink-0 text-highlight" />
      <span>{notice}</span>
      <button onClick={() => setNotice(null)} className="rounded-full p-1 hover:bg-white/15" aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

const Graph3D = lazy(() => import('@/features/graph-3d'));

function readView(): BoardView {
  try {
    return localStorage.getItem('reelmind.view') === '3d' ? '3d' : 'workflow';
  } catch {
    return 'workflow';
  }
}

function readLevel(): LinkLevel {
  try {
    const v = localStorage.getItem('reelmind.linkLevel');
    return v === 'strict' || v === 'loose' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export default function App() {
  const reels = useLiveQuery(() => db.reels.toArray(), [], undefined as Reel[] | undefined);
  const analyses = useLiveQuery(() => db.analyses.toArray(), [], [] as Analysis[]);
  const embeddingRows = useLiveQuery(() => db.embeddings.toArray(), [], []);
  const { job, lastBatchId } = useBatch();

  const [importOpen, setImportOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [history, setHistory] = useState<{ open: boolean; filter: { kind?: GenerationKind; key?: string } }>({ open: false, filter: {} });
  useEffect(() => {
    const onOpen = (e: Event) => setHistory({ open: true, filter: (e as CustomEvent).detail || {} });
    window.addEventListener(HISTORY_EVENT, onOpen);
    return () => window.removeEventListener(HISTORY_EVENT, onOpen);
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [linkLevel, setLinkLevelState] = useState<LinkLevel>(readLevel);
  const [focusRequest, setFocusRequest] = useState<{ id: string; at: number } | null>(null);
  const [view, setViewState] = useState<BoardView>(readView);
  const [exporting, setExporting] = useState<{ scope: ExportScope; tab: 'summary' | 'download' | 'share' } | null>(null);

  const setView = (v: BoardView) => {
    setViewState(v);
    try {
      localStorage.setItem('reelmind.view', v);
    } catch {
      /* preference just won't persist */
    }
  };

  const setLinkLevel = (l: LinkLevel) => {
    setLinkLevelState(l);
    try {
      localStorage.setItem('reelmind.linkLevel', l);
    } catch {
      /* preference just won't persist */
    }
  };

  const byId = useMemo(() => new Map(analyses.map((a) => [a.shortcode, a])), [analyses]);
  const items: CanvasItem[] = useMemo(
    () => (reels || []).filter((r) => r.status === 'analyzed' && byId.has(r.shortcode)).map((reel) => ({ reel, analysis: byId.get(reel.shortcode)! })),
    [reels, byId],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.reel.shortcode, i])), [items]);
  const embeddings = useMemo(() => new Map(embeddingRows.map((e) => [e.shortcode, e.values])), [embeddingRows]);
  const links = useMemo(() => computeLinks(items.map((i) => i.analysis), embeddings, linkLevel), [items, embeddings, linkLevel]);
  const queue = useMemo(() => (reels || []).filter((r) => r.status !== 'analyzed'), [reels]);
  const topics = useMemo(() => new Set(items.map((i) => i.analysis.primaryTopic)).size, [items]);
  const kinds = useMemo(() => [...new Set(items.map((i) => i.analysis.contentType || 'other'))].sort(), [items]);
  const match = useMemo(() => matchReels(items, filters, lastBatchId), [items, filters, lastBatchId]);

  const openItem = openId ? itemById.get(openId) || null : null;
  const related = useMemo(
    () => (openId ? linksOf(openId, links).flatMap((l) => (itemById.has(l.other) ? [{ ...itemById.get(l.other)!, reason: l.reason }] : [])) : []),
    [openId, links, itemById],
  );
  const dueCards = useReviewCount(items);
  const running = job?.status === 'running';
  const finished = job ? job.counts.done + job.counts.cached + job.counts.failed : 0;

  const openReel = (id: string) => {
    setOpenId(id);
    setFocusRequest({ id, at: Date.now() });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 sm:gap-4 sm:px-4">
        <Logo />
        {items.length > 0 && (
          <div className="hidden items-center gap-4 whitespace-nowrap text-[13px] text-muted-foreground xl:flex">
            <span>
              <strong className="font-semibold text-foreground">{items.length.toLocaleString()}</strong> analyzed
            </span>
            <span>
              <strong className="font-semibold text-foreground">{topics}</strong> {topics === 1 ? 'topic' : 'topics'}
            </span>
            <span>
              <strong className="font-semibold text-foreground">{links.length}</strong> {links.length === 1 ? 'link' : 'links'}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <HelperPill onClick={() => setSettingsOpen(true)} />
          {items.length > 0 && (
            <>
              <Button variant="ghost" onClick={() => setReviewOpen(true)} aria-label={`Daily review, ${dueCards} cards due`} className="relative px-2.5 sm:px-3">
                <BrainCircuit /> <span className="hidden 2xl:inline">Review</span>
                {dueCards > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-highlight px-1 text-[10.5px] font-semibold text-foreground 2xl:static 2xl:ml-0.5">
                    {dueCards > 99 ? '99+' : dueCards}
                  </span>
                )}
              </Button>
              <Button variant="ghost" onClick={() => setLibraryOpen(true)} aria-label="Library of skills, prompts and code" className="px-2.5 sm:px-3">
                <Library /> <span className="hidden 2xl:inline">Library</span>
              </Button>
              <Button variant="ghost" onClick={() => setHistory({ open: true, filter: {} })} aria-label="History of AI results" className="px-2.5 sm:px-3">
                <History /> <span className="hidden 2xl:inline">History</span>
              </Button>
              <Button variant="ghost" onClick={() => setDigestOpen(true)} aria-label="Weekly recap" className="px-2.5 sm:px-3">
                <CalendarCheck /> <span className="hidden 2xl:inline">Weekly recap</span>
              </Button>
              <Button variant="ghost" onClick={() => setExporting({ scope: match ? { kind: 'filtered' } : { kind: 'all' }, tab: 'summary' })} aria-label="Export and share" className="px-2.5 sm:px-3">
                <Download /> <span className="hidden 2xl:inline">Export</span>
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)} aria-label="Add reels" className="px-2.5 sm:px-4">
            <Plus /> <span className="hidden sm:inline">Add reels</span>
          </Button>
          {running ? (
            <Button variant="default" onClick={() => setQueueOpen(true)}>
              <Loader2 className="animate-spin" />
              {job!.kind === 'link' ? 'Linking' : 'Analyzing'} {finished} of {job!.counts.total}
            </Button>
          ) : (
            <Button variant={queue.length ? 'highlight' : 'outline'} onClick={() => setQueueOpen(true)}>
              <Sparkles />
              {queue.length ? `Analyze ${queue.length.toLocaleString()}` : 'Analyze'}
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
            <a href={LINKS.repo} target="_blank" rel="noreferrer" aria-label="ReelMind on GitHub" title="Star ReelMind on GitHub">
              <Star />
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings />
          </Button>
        </div>
      </header>

      {items.length > 0 && <FilterBar filters={filters} onChange={setFilters} kinds={kinds} matched={match ? match.size : null} total={items.length} view={view} onView={setView} />}

      <main className="relative min-h-0 flex-1">
        {reels === undefined ? null : items.length > 0 ? (
          view === '3d' ? (
            <Suspense fallback={<p className="p-6 text-[14px] text-muted-foreground">Loading the 3D view…</p>}>
              <Graph3D items={items} links={links} match={match} onOpen={setOpenId} onOpenTopic={setOpenTopic} />
            </Suspense>
          ) : (
            <Canvas items={items} links={links} lastBatchId={lastBatchId} match={match} focusRequest={focusRequest} onOpen={setOpenId} onOpenTopic={setOpenTopic} />
          )
        ) : (
          <EmptyBoard waiting={queue.length} onImport={() => setImportOpen(true)} onAnalyze={() => setQueueOpen(true)} />
        )}
      </main>

      {items.length > 0 && <Timeline items={items} match={match} onPick={openReel} />}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={(n) => n > 0 && setQueueOpen(true)} />
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} queue={queue} />
      <TopicSheet topic={openTopic} items={items} onOpenReel={openReel} onShare={(topic) => setExporting({ scope: { kind: 'topic', topic }, tab: 'share' })} onClose={() => setOpenTopic(null)} />
      <DigestSheet open={digestOpen} onOpenChange={setDigestOpen} items={items} reels={reels || []} onOpenReel={openReel} />
      <ReelSheet reel={openItem?.reel || null} analysis={openItem?.analysis || null} related={related} onOpenReel={openReel} onShare={(id) => setExporting({ scope: { kind: 'reel', id }, tab: 'share' })} onOpenChange={(v) => !v && setOpenId(null)} />
      <ExportDialog
        open={Boolean(exporting)}
        onOpenChange={(v) => !v && setExporting(null)}
        items={items}
        links={links}
        match={match}
        filterLabel={filters.query.trim() ? `Reels matching "${filters.query.trim()}"` : 'Filtered reels'}
        initialScope={exporting?.scope || { kind: 'all' }}
        initialTab={exporting?.tab || 'summary'}
      />
      <HistoryDialog open={history.open} onOpenChange={(v) => setHistory((h) => ({ ...h, open: v }))} filter={history.filter} />
      <LibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} items={items} match={match} onOpenReel={openReel} />
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} items={items} onOpenReel={openReel} />
      <Notice />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} items={items} links={links} linkLevel={linkLevel} onLinkLevel={setLinkLevel} />
    </div>
  );
}

function EmptyBoard({ waiting, onImport, onAnalyze }: { waiting: number; onImport: () => void; onAnalyze: () => void }) {
  const { health, healthError, browserBlocked } = useBatch();
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const offline = Boolean(healthError) || !health;
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-4" style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1.3px, transparent 1.3px)', backgroundSize: '20px 20px' }}>
      <div className="my-auto w-full max-w-[480px] rounded-2xl border bg-background p-7 shadow-[0_24px_60px_-30px_rgb(16_24_40/0.35)]">
        {waiting > 0 ? (
          <>
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{plural(waiting, 'reel')} waiting</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              They're in your library but not analyzed. Pick which ones to analyze; each becomes a node on the board, wired to its topic and the tools it uses.
            </p>
            <Button variant="highlight" size="lg" className="mt-6 w-full" onClick={onAnalyze}>
              <Sparkles /> Review and analyze
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">Turn saved reels into notes you'll remember</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              ReelMind watches the reels you saved on Instagram and maps them by topic, with a summary, key points, a practice task and the tools each one uses. Learn from them, plan content from them, or share them with your team as a PDF, spreadsheet, image or link.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                size="lg"
                variant="highlight"
                onClick={async () => {
                  setLoading(true);
                  await loadSample();
                  setLoading(false);
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Try with 16 sample reels
              </Button>
              <Button size="lg" onClick={onImport}>
                <Plus /> Add my saved reels
              </Button>
            </div>
            {(offline || health?.needsCode) && (
              <div className="mt-5 rounded-lg bg-muted text-[13px]">
                <button onClick={() => setShowSetup((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left font-medium">
                  {browserBlocked ? 'Allow this site to reach your helper' : health?.needsCode ? 'Connect the helper you started' : 'To analyze your own reels, run the free helper'}
                  <ChevronDown className={cn('size-4 transition-transform', showSetup && 'rotate-180')} />
                </button>
                {showSetup && (
                  <div className="px-3 pb-3">
                    {browserBlocked ? (
                      <p className="text-muted-foreground">{healthError}</p>
                    ) : health?.needsCode ? (
                      <p className="text-muted-foreground">Open the link the helper printed, or paste its connect code in Settings.</p>
                    ) : (
                      <SetupSteps />
                    )}
                  </div>
                )}
              </div>
            )}
            {health?.demo && <p className="mt-3 text-center text-[12.5px] text-muted-foreground">Demo mode is on: any reel links work and results are samples.</p>}
            <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
              Free and open source.{' '}
              <a href={LINKS.repo} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">
                View on GitHub
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
