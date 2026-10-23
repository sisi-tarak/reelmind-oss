import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Blocks, Check, ChevronDown, History, Code2, Copy, Download, ExternalLink, FileArchive, FileText, Loader2, MessageSquareText, PencilLine, RotateCcw, Search, Sparkles, Workflow, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { categoryMarkdown, CATEGORIES, collectAssets, contentOf, fileNameOf, skillNameOf, toolsCsv, zipEntries, type AssetItem, type AssetKind } from '@/lib/assets';
import { db } from '@/lib/db';
import { helper } from '@/lib/helper';
import { openHistory, recordGeneration } from '@/lib/history';
import { topicLabel } from '@/lib/topics';
import type { AssetEdit } from '@/lib/types';
import { cn, plural } from '@/lib/utils';
import { useBatch } from './batch';
import type { CanvasItem } from './canvas';

const ICONS: Record<AssetKind, LucideIcon> = { skill: Blocks, prompt: MessageSquareText, snippet: Code2, workflow: Workflow, tool: Wrench };
const EXTRACT_CHUNK = 12;

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function zip(entries: { path: string; content: string }[], name: string) {
  const { default: JSZip } = await import('jszip');
  const z = new JSZip();
  for (const e of entries) z.file(e.path, e.content);
  save(await z.generateAsync({ type: 'blob' }), name);
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  return { copied, copy };
}

export function LibraryDialog({ open, onOpenChange, items, match, onOpenReel }: { open: boolean; onOpenChange: (v: boolean) => void; items: CanvasItem[]; match: Set<string> | null; onOpenReel: (id: string) => void }) {
  const { ready, provider, health } = useBatch();
  const [kind, setKind] = useState<AssetKind>('skill');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [editing, setEditing] = useState<AssetItem | null>(null);
  const [finding, setFinding] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { copied, copy } = useCopied();
  const editRows = useLiveQuery(() => db.assetEdits.toArray(), [], [] as AssetEdit[]);
  const edits = useMemo(() => new Map(editRows.map((e) => [e.id, e])), [editRows]);

  useEffect(() => {
    if (scope === 'filter' && !match) setScope('all');
  }, [match, scope]);

  const topics = useMemo(() => [...new Set(items.map((i) => i.analysis.primaryTopic))].sort(), [items]);
  const scoped = useMemo(() => (scope === 'all' ? items : scope === 'filter' ? items.filter((i) => match?.has(i.reel.shortcode)) : items.filter((i) => i.analysis.primaryTopic === scope)), [items, scope, match]);
  const all = useMemo(() => collectAssets(scoped), [scoped]);
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.kind, all.filter((a) => a.kind === c.kind).length])) as Record<AssetKind, number>, [all]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => all.filter((a) => a.kind === kind && (!q || `${a.title} ${a.subtitle} ${contentOf(a, edits)} ${a.sources.map((s) => `${s.title} ${s.creator}`).join(' ')}`.toLowerCase().includes(q))),
    [all, kind, q, edits],
  );
  // Reels analyzed before the analysis looked for skills, prompts and code.
  const older = useMemo(() => scoped.filter((i) => !i.analysis.assets && (i.analysis.provider !== 'demo' || health?.demo)).map((i) => i.analysis), [scoped, health?.demo]);
  const cat = CATEGORIES.find((c) => c.kind === kind)!;
  const stamp = new Date().toISOString().slice(0, 10);

  const findOlder = async () => {
    setMessage(null);
    setFinding({ done: 0, total: older.length });
    let found = 0;
    const log: Record<string, { title: string; assets: unknown }> = {};
    try {
      for (let i = 0; i < older.length; i += EXTRACT_CHUNK) {
        const chunk = older.slice(i, i + EXTRACT_CHUNK);
        const result = await helper.extract(chunk, provider);
        for (const [sc, assets] of Object.entries(result)) {
          await db.analyses.update(sc, { assets });
          log[sc] = { title: chunk.find((a) => a.shortcode === sc)?.title || sc, assets };
          found += assets.skills.length + assets.prompts.length + assets.snippets.length + assets.workflows.length;
        }
        setFinding({ done: Math.min(i + EXTRACT_CHUNK, older.length), total: older.length });
      }
      await recordGeneration({ kind: 'assets', key: new Date().toISOString().slice(0, 10), title: `Skills, prompts and code from ${plural(older.length, 'older reel')}`, request: `Find reusable parts in ${plural(older.length, 'reel')}`, preview: `Found ${found} items`, data: log });
      setMessage(`Done. Found ${plural(found, 'skill, prompt or snippet', 'skills, prompts and snippets')} in ${plural(older.length, 'reel')}.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setFinding(null);
    }
  };

  const downloadOne = (it: AssetItem) => {
    const content = contentOf(it, edits);
    save(new Blob([content], { type: 'text/plain' }), fileNameOf(it));
  };
  const downloadSkillZip = (it: AssetItem) => zip(zipEntries([it], edits), `${skillNameOf(contentOf(it, edits), it.title)}.zip`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(880px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4 pr-12">
          <div className="mr-auto min-w-0">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.01em]">Library</DialogTitle>
            <DialogDescription className="text-[13px]">Skills, prompts, code, workflows and tools from your reels. Copy, download or make them your own.</DialogDescription>
          </div>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 rounded-lg border bg-background px-2.5 text-[13.5px]" aria-label="Which reels">
            <option value="all">All reels ({items.length})</option>
            {match && <option value="filter">Current filter ({match.size})</option>}
            {topics.map((t) => (
              <option key={t} value={t}>
                {topicLabel(t)}
              </option>
            ))}
          </select>
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library" className="h-9 pl-8" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-[220px] md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3" aria-label="Categories">
            {CATEGORIES.map((c) => {
              const Icon = ICONS[c.kind];
              return (
                <button
                  key={c.kind}
                  onClick={() => setKind(c.kind)}
                  className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium', kind === c.kind ? 'bg-foreground text-background' : 'hover:bg-muted')}
                  aria-current={kind === c.kind}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 whitespace-nowrap">{c.label}</span>
                  <span className={cn('rounded-full px-1.5 text-[12px] tabular-nums', kind === c.kind ? 'bg-background/20' : 'bg-muted text-muted-foreground')}>{counts[c.kind]}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b px-5 py-3">
              <p className="text-[12.5px] leading-snug text-muted-foreground">{cat.hint}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-muted-foreground">Download all {shown.length}:</span>
              {kind === 'skill' && (
                <Button size="sm" variant="highlight" disabled={!shown.length} onClick={() => zip(zipEntries(shown, edits), `claude-skills-${stamp}.zip`)}>
                  <FileArchive /> Skills .zip
                </Button>
              )}
              {kind === 'snippet' && (
                <Button size="sm" variant="outline" disabled={!shown.length} onClick={() => zip(zipEntries(shown, edits), `code-from-reels-${stamp}.zip`)}>
                  <FileArchive /> Files .zip
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!shown.length}
                onClick={async () => save(await (await import('@/lib/assets-docx')).categoryDocx(kind, shown, edits), `${cat.label.toLowerCase().replace(/[^a-z]+/g, '-')}-${stamp}.docx`)}
              >
                <FileText /> Word
              </Button>
              <Button size="sm" variant="outline" disabled={!shown.length} onClick={() => save(new Blob([categoryMarkdown(kind, shown, edits)], { type: 'text/markdown' }), `${cat.label.toLowerCase().replace(/[^a-z]+/g, '-')}-${stamp}.md`)}>
                <Download /> Markdown
              </Button>
              {kind === 'tool' && (
                <Button size="sm" variant="outline" disabled={!shown.length} onClick={() => save(new Blob([toolsCsv(shown)], { type: 'text/csv' }), `tools-${stamp}.csv`)}>
                  <Download /> CSV
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!shown.length} onClick={() => copy('all', categoryMarkdown(kind, shown, edits))}>
                {copied === 'all' ? <Check /> : <Copy />} Copy all
              </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {older.length > 0 && kind !== 'tool' && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/50 px-4 py-3">
                  <Sparkles className="size-4 shrink-0 text-[#a16207]" />
                  <p className="min-w-[220px] flex-1 text-[13px]">
                    {plural(older.length, 'reel was', 'reels were')} analyzed before ReelMind looked for skills, prompts and code. Finding them takes one small text-only AI call per 3 reels; videos are not analyzed again.
                  </p>
                  <Button size="sm" variant="outline" disabled={!ready || Boolean(finding)} onClick={findOlder}>
                    {finding ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {finding ? `Looking… ${finding.done} of ${finding.total}` : ready ? 'Find them' : 'Start the helper first'}
                  </Button>
                </div>
              )}
              {message && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-[13px]">{message}</p>}
              {shown.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  {(() => {
                    const Icon = ICONS[kind];
                    return <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} />;
                  })()}
                  <p className="mt-3 text-[15px] font-medium">{q ? 'Nothing matches that search' : `No ${cat.label.toLowerCase()} yet`}</p>
                  <p className="mt-1 max-w-[380px] text-[13px] text-muted-foreground">
                    {kind === 'skill' ? 'Skills appear when a reel shows or teaches a Claude skill. Analyze reels about Claude skills and they land here.' : 'They appear here as you analyze reels that show them.'}
                  </p>
                </div>
              ) : kind === 'tool' ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {shown.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 rounded-xl border bg-background p-3">
                      <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold">{t.title}</p>
                        <p className="text-[12.5px] text-muted-foreground">{t.subtitle}</p>
                        <button onClick={() => (onOpenChange(false), onOpenReel(t.sources[0].shortcode))} className="mt-1 block w-full truncate text-left text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                          From: {t.sources[0].title}
                        </button>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {t.url && (
                          <Button size="icon" variant="ghost" asChild>
                            <a href={t.url} target="_blank" rel="noreferrer" aria-label={`Open ${t.title}`}>
                              <ExternalLink />
                            </a>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => copy(t.id, t.original)} aria-label={`Copy ${t.title}`}>
                          {copied === t.id ? <Check /> : <Copy />}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-3">
                  {shown.map((it) => (
                    <AssetCard
                      key={it.id}
                      item={it}
                      content={contentOf(it, edits)}
                      edited={Boolean(edits.get(it.id)?.content)}
                      copied={copied === it.id}
                      onCopy={() => copy(it.id, contentOf(it, edits))}
                      onDownload={() => downloadOne(it)}
                      onZip={() => downloadSkillZip(it)}
                      onCustomize={() => setEditing(it)}
                      onOpenReel={() => (onOpenChange(false), onOpenReel(it.sources[0].shortcode))}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        {editing && <CustomizeDialog item={editing} content={contentOf(editing, edits)} edited={Boolean(edits.get(editing.id)?.content)} onClose={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function AssetCard(p: { item: AssetItem; content: string; edited: boolean; copied: boolean; onCopy: () => void; onDownload: () => void; onZip: () => void; onCustomize: () => void; onOpenReel: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICONS[p.item.kind];
  const lines = p.content.split('\n');
  const long = lines.length > 10 || p.content.length > 700;
  const s = p.item.sources[0];
  const copyLabel = p.item.kind === 'prompt' ? 'Copy prompt' : p.item.kind === 'snippet' ? 'Copy code' : 'Copy';
  return (
    <li className="rounded-xl border bg-background">
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('flex flex-wrap items-center gap-2 text-[14.5px] font-semibold', p.item.kind === 'skill' && 'font-mono text-[13.5px]')}>
            {p.item.title}
            {p.edited && <span className="rounded-full bg-[#2563eb]/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-[#2563eb]">Edited</span>}
          </p>
          {p.item.subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{p.item.subtitle}</p>}
          <button onClick={p.onOpenReel} className="mt-1 block w-full truncate text-left text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            From: {s.title}
            {s.creator ? ` by @${s.creator}` : ''}
          </button>
        </div>
      </div>
      <div className="relative mx-4 mt-3">
        <pre className={cn('overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[#f4f5f7] p-3 font-mono text-[12.5px] leading-relaxed', !expanded && long && 'max-h-[180px] overflow-hidden')}>{p.content}</pre>
        {long && (
          <button onClick={() => setExpanded((v) => !v)} className={cn('flex w-full items-center justify-center gap-1 py-1 text-[12px] font-medium text-muted-foreground hover:text-foreground', !expanded && 'absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-[#f4f5f7] via-[#f4f5f7]/90 to-transparent pt-8')}>
            {expanded ? 'Show less' : 'Show all'} <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 px-4 pb-3 pt-2.5">
        <Button size="sm" variant="ghost" onClick={p.onCopy}>
          {p.copied ? <Check /> : <Copy />} {copyLabel}
        </Button>
        {p.item.kind === 'skill' ? (
          <>
            <Button size="sm" variant="ghost" onClick={p.onDownload}>
              <Download /> SKILL.md
            </Button>
            <Button size="sm" variant="outline" onClick={p.onZip} title="Upload this .zip in Claude, Settings, Capabilities">
              <FileArchive /> .zip for Claude
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={p.onDownload}>
            <Download /> Download
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={p.onCustomize}>
          <PencilLine /> Customize
        </Button>
      </div>
    </li>
  );
}

function CustomizeDialog({ item, content, edited, onClose }: { item: AssetItem; content: string; edited: boolean; onClose: () => void }) {
  const { ready, provider } = useBatch();
  const [text, setText] = useState(content);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  const rewrite = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await helper.rewrite(item.kind, text, instruction, provider);
      setPrevious(text);
      setText(r.content);
      await recordGeneration({ kind: 'rewrite', key: item.id, title: `Rewrite: ${item.title}`, request: instruction, preview: r.content, model: r.model, data: { before: text, after: r.content, instruction, assetId: item.id, assetKind: item.kind, title: item.title } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    await db.assetEdits.put({ id: item.id, content: text.trim() === item.original.trim() ? '' : text, updatedAt: new Date().toISOString() });
    onClose();
  };

  const revert = async () => {
    await db.assetEdits.put({ id: item.id, content: '', updatedAt: new Date().toISOString() });
    onClose();
  };

  const examples = {
    skill: ['Make it for Next.js projects', 'Add a step that runs the tests first', 'Write it for my team at Webortex'],
    prompt: ['Make it shorter', 'Add a [tone] placeholder', 'Write it in Telugu-English'],
    snippet: ['Convert to TypeScript', 'Add comments to each line', 'Make it work on Windows PowerShell'],
    workflow: ['Use Google Sheets instead of Airtable', 'Add an error alert step', 'Explain each step for a beginner'],
    tool: [],
  }[item.kind];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[760px] flex-col gap-0 p-0">
        <div className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-[16px] font-semibold">Customize: {item.title}</DialogTitle>
          <DialogDescription className="text-[12.5px]">Edit it yourself, or tell the AI what to change. The original stays safe; you can go back to it any time.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={item.kind !== 'snippet'}
            className="min-h-[300px] flex-1 resize-y rounded-lg border bg-[#fbfbfc] p-3 font-mono text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/30"
            aria-label="Content"
          />
          <div className="rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Sparkles className="size-3.5" /> Ask AI to change it
            </p>
            <div className="flex gap-2">
              <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="For example: make it for Next.js projects" onKeyDown={(e) => e.key === 'Enter' && instruction.trim() && ready && !busy && rewrite()} />
              <Button onClick={rewrite} disabled={!instruction.trim() || !ready || busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Rewrite
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button key={ex} onClick={() => setInstruction(ex)} className="rounded-full border px-2.5 py-0.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
            {!ready && <p className="mt-2 text-[12px] text-muted-foreground">Start the helper to use AI rewrites. You can still edit by hand.</p>}
            {previous !== null && (
              <button onClick={() => (setText(previous), setPrevious(null))} className="mt-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                <RotateCcw className="size-3" /> Undo the AI change
              </button>
            )}
            {error && <p className="mt-2 text-[12.5px] text-destructive">{error}</p>}
            <button onClick={() => openHistory({ kind: 'rewrite', key: item.id })} className="mt-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
              <History className="size-3" /> Earlier rewrites of this {item.kind}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t px-5 py-3">
          {edited && (
            <Button variant="ghost" onClick={revert}>
              <RotateCcw /> Back to original
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={saveEdit}>
            <Check /> Save my version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
