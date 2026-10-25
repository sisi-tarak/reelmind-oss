import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert, CircleCheck, Copy, Download, FileText, Heart, Link2, Star, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { db, exportWorkspace, importWorkspace, removeDemoData } from '@/lib/db';
import { exportMarkdown } from '@/lib/export';
import { connectCode, DEFAULT_HELPER_URL, helperUrl, setConnectCode, setHelperUrl } from '@/lib/helper';
import type { LinkLevel } from '@/lib/links';
import { LINKS } from '@/lib/site';
import type { Link } from '@/lib/types';
import { cn, plural } from '@/lib/utils';
import { useBatch } from './batch';
import type { CanvasItem } from './canvas';
import { ExtensionSection, PhoneSection, SyncSection } from './settings-extras';

function Row({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
    </li>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const SETUP_COMMANDS = [`git clone ${LINKS.repo}.git`, 'cd reelmind', 'npm install', 'npm run helper'];

export function SetupSteps() {
  const [copied, setCopied] = useState(false);
  const text = SETUP_COMMANDS.join('\n');
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <p className="text-muted-foreground">
        The helper runs on your computer and does the downloading and AI calls, so your keys and reels never leave it. You need{' '}
        <a className="underline underline-offset-2" href="https://nodejs.org" target="_blank" rel="noreferrer">
          Node.js 22+
        </a>
        ,{' '}
        <a className="underline underline-offset-2" href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noreferrer">
          yt-dlp
        </a>{' '}
        and a free{' '}
        <a className="underline underline-offset-2" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Gemini key
        </a>
        . Then in a terminal:
      </p>
      <div className="relative rounded-md bg-foreground p-3 font-mono text-[12.5px] leading-relaxed text-background">
        <pre className="overflow-x-auto">{text}</pre>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11.5px] text-background/70 hover:bg-background/10 hover:text-background"
        >
          <Copy className="size-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-muted-foreground">
        The first run asks for your Gemini key. It then prints a link that connects this site to it. Full guide in the{' '}
        <a className="underline underline-offset-2" href={`${LINKS.repo}#readme`} target="_blank" rel="noreferrer">
          README
        </a>
        .
      </p>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  items,
  links,
  linkLevel,
  onLinkLevel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CanvasItem[];
  links: Link[];
  linkLevel: LinkLevel;
  onLinkLevel: (l: LinkLevel) => void;
}) {
  const { health, healthError, browserBlocked, ready, refreshHealth, buildLinks, job } = useBatch();
  const [url, setUrl] = useState(helperUrl() || DEFAULT_HELPER_URL);
  const [code, setCode] = useState(connectCode());
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const embedded = useLiveQuery(() => db.embeddings.toCollection().primaryKeys(), [], [] as string[]);
  const boards = useLiveQuery(() => db.topicBoards.toArray(), [], []);
  const have = new Set(embedded);
  const missing = items.filter((i) => !have.has(i.reel.shortcode) && !i.reel.collections?.includes('ReelMind sample'));
  const hasDemo = items.some((i) => i.analysis.provider === 'demo');

  const backup = async () => {
    const data = await exportWorkspace();
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `reelmind-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      await importWorkspace(JSON.parse(await f.text()));
      setNote('Backup restored.');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  const markdown = async () => {
    const blob = await exportMarkdown(items, links, boards);
    download(blob, `reelmind-notes-${new Date().toISOString().slice(0, 10)}.zip`);
    setNote(`Exported ${plural(items.length, 'note')}. In Obsidian, unzip into your vault. In Notion, use Import, then Text & Markdown.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your reels and notes are stored only in this browser and in the helper's cache on your computer.</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Helper on your computer</h3>
          {browserBlocked ? (
            <ul>
              <Row ok={false} label="Your browser is blocking access to the helper" hint={healthError || undefined} />
            </ul>
          ) : healthError || !health ? (
            <>
              <ul>
                <Row ok={false} label="Helper not running" hint="Start it to add, analyze and link reels. You can still browse everything already on your board." />
              </ul>
              <SetupSteps />
            </>
          ) : health.needsCode ? (
            <ul>
              <Row ok={false} label="Helper found, waiting for the connect code" hint="Copy the code from the helper window, or open the link it prints." />
            </ul>
          ) : (
            <ul className="divide-y">
              <Row ok label={health.demo ? 'Helper running in demo mode' : `Helper running, version ${health.version}`} hint={health.demo ? 'Sample results only. Run "npm run helper" for real analysis.' : undefined} />
              {!health.demo && (
                <>
                  <Row
                    ok={health.gemini?.configured}
                    label={health.gemini?.configured ? `${(health.gemini?.keys || 1) > 1 ? `${health.gemini?.keys} Gemini keys` : 'Gemini key'} set, using ${health.gemini?.model}` : 'No Gemini key'}
                    hint={
                      health.gemini?.configured
                        ? `${(health.gemini?.keys || 1) > 1 ? `${health.gemini?.keysAvailable ?? health.gemini?.keys} of ${health.gemini?.keys} ready; when one reaches its limit the next takes over. ` : 'Add up to 4 more as GEMINI_API_KEY_2 to _5 in helper/.env (each from a different Google Cloud project) to keep going when one hits its daily limit. '}Paced to ${(health.gemini?.rpm ?? 0) * (health.gemini?.keys || 1)} calls a minute.`
                        : 'Get a free key at aistudio.google.com/apikey and put it in helper/.env as GEMINI_API_KEY.'
                    }
                  />
                  <Row
                    ok={health.claude?.configured}
                    label={health.claude?.configured ? `Claude key set, using ${health.claude?.model}` : 'Claude not set up (optional)'}
                    hint={health.claude?.configured ? undefined : 'Add ANTHROPIC_API_KEY to helper/.env to re-analyze reels and build boards with Claude. Billed by Anthropic per use.'}
                  />
                  <Row ok={health.tools?.ytdlp?.found} label={health.tools?.ytdlp?.found ? `yt-dlp ${health.tools?.ytdlp?.version}` : 'yt-dlp not found'} hint={health.tools?.ytdlp?.found ? undefined : 'Install with "pip install -U yt-dlp", "brew install yt-dlp" or "winget install yt-dlp".'} />
                  <Row ok={health.tools?.ffmpeg?.found} label={health.tools?.ffmpeg?.found ? 'ffmpeg found' : 'ffmpeg not found'} hint={health.tools?.ffmpeg?.found ? undefined : 'Recommended for reliable downloads and for Claude frames.'} />
                  <Row ok={health.cookies} label={health.cookies ? 'Instagram sign-in cookies set' : 'No Instagram cookies set'} hint={health.cookies ? undefined : 'If downloads fail with a login message, set YTDLP_COOKIES_BROWSER in helper/.env.'} />
                </>
              )}
            </ul>
          )}
          <form
            className="mt-2 grid grid-cols-[1fr_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setHelperUrl(url.trim());
              setConnectCode(code);
              refreshHealth();
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Connect code from the helper window" aria-label="Connect code" className="font-mono text-[13px]" />
            <Button type="submit" variant={health?.needsCode ? 'default' : 'outline'}>
              Connect
            </Button>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Helper address" className="col-span-2 font-mono text-[12.5px] text-muted-foreground" />
          </form>
        </section>

        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4" /> Links between reels
          </h3>
          <p className="text-[13px] text-muted-foreground">How close two reels must be in meaning to get a dashed violet wire on the board.</p>
          <div className="flex gap-1.5">
            {(['strict', 'normal', 'loose'] as const).map((l) => (
              <button key={l} onClick={() => onLinkLevel(l)} className={cn('rounded-full border px-3 py-1 text-[13px] capitalize', linkLevel === l ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
                {l}
              </button>
            ))}
            <span className="ml-auto self-center text-[12.5px] text-muted-foreground">{plural(links.length, 'link')} now</span>
          </div>
          {missing.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
              <p className="flex-1 text-[13px]">
                {plural(missing.length, 'reel')} {missing.length === 1 ? 'is' : 'are'} linked by tags only. Build meaning links for them: one small, free-tier call each.
              </p>
              <Button size="sm" variant="outline" disabled={!ready || job?.status === 'running' || !(health?.embeddings ?? false)} onClick={() => buildLinks(missing.map((m) => m.reel))}>
                Build links
              </Button>
            </div>
          )}
        </section>

        <SyncSection />
        <PhoneSection />
        <ExtensionSection />

        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Export and backup</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={markdown} disabled={!items.length}>
              <FileText /> Notes for Obsidian or Notion
            </Button>
            <Button variant="outline" onClick={backup}>
              <Download /> Download backup
            </Button>
            <Button variant="outline" onClick={() => file.current?.click()}>
              <Upload /> Restore backup
            </Button>
            <input ref={file} type="file" accept=".json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">Notes export as Markdown with links between related reels. A backup holds everything and restores on another computer without re-analyzing.</p>
          {hasDemo && (
            <Button
              variant="ghost"
              className="self-start text-destructive"
              onClick={async () => {
                await removeDemoData();
                setNote('Sample and demo cards removed.');
              }}
            >
              Remove sample and demo cards
            </Button>
          )}
          {note && <p className="text-[13px]">{note}</p>}
        </section>

        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Support ReelMind</h3>
          <p className="text-[13px] text-muted-foreground">ReelMind is free and open source. If it helps you learn, a star or a sponsorship keeps it going.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={LINKS.repo} target="_blank" rel="noreferrer">
                <Star /> Star on GitHub
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={LINKS.sponsor} target="_blank" rel="noreferrer">
                <Heart className="text-destructive" /> Sponsor
              </a>
            </Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Want an AI tool like this for your business?{' '}
            <a href={LINKS.company} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">
              Webortex builds them
            </a>
            .
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
