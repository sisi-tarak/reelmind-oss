import { useRef, useState } from 'react';
import { ChevronDown, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { commitImport, previewImport, type ImportSummary } from '@/lib/db';
import { parseImport, type ParseResult } from '@/lib/parse';
import { cn, formatDate, plural } from '@/lib/utils';

export function ImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: (added: number) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setText('');
    setError(null);
    setParsed(null);
    setSummary(null);
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await parseImport(files, text);
      if (!result.reels.length) {
        setError('No Instagram reel or post links found. Upload saved_posts.json, saved_collections.json, the whole ZIP, or paste links like instagram.com/reel/…');
        return;
      }
      setParsed(result);
      setSummary(await previewImport(result.reels));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const s = await commitImport(parsed.reels);
      close(false);
      onImported(s.added + s.previouslyFailed + s.alreadyQueued);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dates = parsed?.reels.map((r) => r.savedAt).filter(Boolean).sort() as string[] | undefined;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[560px]">
        {!parsed ? (
          <>
            <DialogHeader>
              <DialogTitle>Add saved reels</DialogTitle>
              <DialogDescription>Adding reels is free. Nothing is downloaded or analyzed until you click Analyze.</DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                setFiles([...e.dataTransfer.files]);
              }}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-6 py-8 text-center transition-colors hover:bg-muted',
                dragging && 'border-foreground bg-muted',
              )}
            >
              <FileUp className="size-6 text-muted-foreground" />
              {files.length ? (
                <span className="text-sm font-medium">{files.map((f) => f.name).join(', ')}</span>
              ) : (
                <>
                  <span className="text-sm font-medium">Drop your Instagram export here, or choose a file</span>
                  <span className="text-[13px] text-muted-foreground">The whole ZIP, saved_posts.json, saved_collections.json or the HTML version</span>
                </>
              )}
            </button>
            <input ref={input} type="file" multiple accept=".zip,.json,.html,.htm,.txt" className="hidden" onChange={(e) => setFiles([...(e.target.files || [])])} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="paste" className="text-sm font-medium">
                Or paste reel links
              </label>
              <Textarea id="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={'https://www.instagram.com/reel/…\nOne or many, any format'} className="min-h-20 font-mono text-[12.5px]" />
            </div>

            <div className="rounded-lg bg-muted text-[13px]">
              <button type="button" onClick={() => setShowHelp((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 font-medium">
                How to download your saved reels from Instagram
                <ChevronDown className={cn('size-4 transition-transform', showHelp && 'rotate-180')} />
              </button>
              {showHelp && (
                <ol className="list-decimal space-y-1 px-3 pb-3 pl-8 text-muted-foreground">
                  <li>In Instagram, open Settings, then Accounts Center.</li>
                  <li>Choose Your information and permissions, then Download your information.</li>
                  <li>Pick Some of your information and tick Saved.</li>
                  <li>Choose Download to device, format JSON, and the date range you want.</li>
                  <li>When Instagram emails you, download the ZIP and drop it here.</li>
                </ol>
              )}
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={read} disabled={busy || (!files.length && !text.trim())}>
                <Upload />
                {busy ? 'Reading…' : 'Read links'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{plural(parsed.reels.length, 'reel')} found</DialogTitle>
              <DialogDescription>
                From {parsed.sources.join(', ')}
                {dates?.length ? `, saved ${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
              </DialogDescription>
            </DialogHeader>
            {summary && (
              <dl className="grid grid-cols-2 gap-2">
                <Stat label="New, ready to analyze" value={summary.added} strong />
                <Stat label="Already analyzed, reused for free" value={summary.alreadyAnalyzed} />
                <Stat label="Already waiting in your queue" value={summary.alreadyQueued} />
                <Stat label="Failed before, can retry" value={summary.previouslyFailed} />
              </dl>
            )}
            {parsed.duplicatesInUpload > 0 && <p className="text-[13px] text-muted-foreground">{plural(parsed.duplicatesInUpload, 'duplicate link')} in this upload merged into one.</p>}
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setParsed(null)}>
                Back
              </Button>
              <Button onClick={commit} disabled={busy}>
                {summary && summary.added > 0 ? `Add ${plural(summary.added, 'reel')} to library` : 'Done'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', strong && value > 0 && 'border-foreground')}>
      <dd className="text-2xl font-semibold tracking-[-0.02em]">{value.toLocaleString()}</dd>
      <dt className="text-[12.5px] leading-tight text-muted-foreground">{label}</dt>
    </div>
  );
}
