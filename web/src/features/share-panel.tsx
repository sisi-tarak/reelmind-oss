// Share a reel, a topic or a whole selection: as a social image card, or as a read-only link.
import { useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, ImageDown, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dataUrlToBlob, downloadBlob, slug } from '@/lib/capture';
import { makeShareLink } from '@/lib/share';
import { cn } from '@/lib/utils';
import { CARD_SIZES, ShareCard, type CardContent, type CardSize } from './share-card';

const PREVIEW_W = 300;

export function ShareImage({ content }: { content: CardContent }) {
  const [size, setSize] = useState<CardSize>('post');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const { w, h } = CARD_SIZES[size];
  const scale = PREVIEW_W / w;

  const save = async (format: 'png' | 'jpeg') => {
    if (!card.current) return;
    setBusy(format);
    setError(null);
    try {
      const { toJpeg, toPng } = await import('html-to-image');
      const opts = { width: w, height: h, pixelRatio: 1, cacheBust: true, style: { transform: 'none' } };
      const url = format === 'jpeg' ? await toJpeg(card.current, { ...opts, quality: 0.95, backgroundColor: '#ffffff' }) : await toPng(card.current, opts);
      downloadBlob(dataUrlToBlob(url), `${slug(content.title)}-${size}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    } catch (e) {
      setError((e as Error).message || 'Could not make the image.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="shrink-0 overflow-hidden rounded-lg border shadow-sm" style={{ width: PREVIEW_W, height: h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: h }}>
          <ShareCard ref={card} content={content} size={size} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(CARD_SIZES) as CardSize[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={cn('flex items-center justify-between rounded-md border px-3 py-2 text-left text-[13px]', size === s ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
            >
              <span className="font-medium">{CARD_SIZES[s].label}</span>
              <span className={size === s ? 'text-background/70' : 'text-muted-foreground'}>{CARD_SIZES[s].hint}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => save('png')} disabled={Boolean(busy)} className="flex-1">
            {busy === 'png' ? <Loader2 className="animate-spin" /> : <ImageDown />} PNG
          </Button>
          <Button variant="outline" onClick={() => save('jpeg')} disabled={Boolean(busy)} className="flex-1">
            {busy === 'jpeg' ? <Loader2 className="animate-spin" /> : <ImageDown />} JPG
          </Button>
        </div>
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export function ShareLink({ content }: { content: CardContent }) {
  const [link, setLink] = useState<{ url: string; reels: number; trimmed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await makeShareLink(content.title, content.items, content.board));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        A read-only page anyone can open, with these notes and their Instagram links. Nothing is uploaded: the notes are packed inside the link itself, so only people you send it to can see them. Transcripts and your practice progress are left out.
      </p>
      {!link ? (
        <Button onClick={make} disabled={busy} className="self-start">
          {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Create share link
        </Button>
      ) : (
        <>
          <div className="flex gap-2">
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted px-3 font-mono text-[12px]" aria-label="Share link" />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={link.url} target="_blank" rel="noreferrer" aria-label="Open share page">
                <ExternalLink />
              </a>
            </Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Includes {link.reels} {link.reels === 1 ? 'reel' : 'reels'}
            {link.trimmed ? ' (the first 40; narrow your selection to share the rest)' : ''}.
          </p>
        </>
      )}
      {error && <p className="text-[12.5px] text-destructive">{error}</p>}
    </div>
  );
}

export function ShareDialog({ open, onOpenChange, content }: { open: boolean; onOpenChange: (v: boolean) => void; content: CardContent | null }) {
  const [tab, setTab] = useState<'image' | 'link'>('image');
  const key = useMemo(() => (content ? `${content.kind}:${content.title}:${content.items.length}` : ''), [content]);
  return (
    <Dialog open={open && Boolean(content)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        {content && (
          <>
            <DialogHeader>
              <DialogTitle>Share {content.kind === 'reel' ? 'this reel' : content.kind === 'topic' ? 'this topic' : 'these notes'}</DialogTitle>
              <DialogDescription>{content.title}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-1.5">
              {(['image', 'link'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn('rounded-full border px-3 py-1 text-[13px]', tab === t ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
                  {t === 'image' ? 'Image card' : 'Share link'}
                </button>
              ))}
            </div>
            <div key={key}>{tab === 'image' ? <ShareImage content={content} /> : <ShareLink content={content} />}</div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
