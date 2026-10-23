import { useEffect, useState } from 'react';
import { Check, ChevronDown, Cloud, Copy, Loader2, Puzzle, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signIn, signOut, syncNow, useCloud } from '@/lib/cloud';
import { connectCode } from '@/lib/helper';
import { LINKS } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useBatch } from './batch';

export function ExtensionSection() {
  const { ready } = useBatch();
  const [copied, setCopied] = useState(false);
  const code = connectCode();
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Puzzle className="size-4" /> Browser extension
      </h3>
      <p className="text-[13px] text-muted-foreground">A side panel that stays open while you browse Instagram. Send or analyze the reel you're watching, or collect many (even your whole Saved page) and send them together. Reels arrive here within seconds.</p>
      <ol className="list-decimal space-y-1 pl-5 text-[13px]">
        <li>
          In Chrome, Edge or Brave open <code className="rounded bg-muted px-1">chrome://extensions</code> and turn on Developer mode.
        </li>
        <li>
          Click Load unpacked and pick the <code className="rounded bg-muted px-1">extension</code> folder in your ReelMind download (
          <a href={`${LINKS.repo}/tree/main/extension`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            on GitHub
          </a>
          ).
        </li>
        <li>Click the ReelMind icon to open the side panel, open Connection and paste your connect code.</li>
      </ol>
      {code && ready && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />} Copy connect code
        </Button>
      )}
    </section>
  );
}

export function SyncSection() {
  const cloud = useCloud();
  if (!cloud.configured) return null;
  const busy = cloud.status === 'loading';
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Cloud className="size-4" /> Sync across devices
      </h3>
      {cloud.user ? (
        <>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            {cloud.user.photo ? <img src={cloud.user.photo} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" /> : <span className="size-8 rounded-full bg-foreground/10" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{cloud.user.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'error' ? 'Sync paused' : cloud.lastSync ? `Synced ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Connected'}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={syncNow} aria-label="Sync now" disabled={cloud.status === 'syncing'}>
              {cloud.status === 'syncing' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <Button size="sm" variant="outline" onClick={signOut}>
              Turn off
            </Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">Reels, notes, review progress, boards, recaps, your board layout and your Library edits sync with your other devices. Sample and demo reels stay on this device. Analysis still runs only on a computer with the helper.</p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">Sign in with Google to keep your notes and review progress on your phone and other computers. Your data is stored in your own private space, readable only by you.</p>
          <Button variant="outline" className="self-start" onClick={signIn} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Cloud />} Sign in with Google
          </Button>
        </>
      )}
      {cloud.error && <p className="text-[13px] text-destructive">{cloud.error}</p>}
    </section>
  );
}

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import('qrcode').then((q) => q.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [text]);
  // The library returns a plain SVG string with no scripts; shown as an image so nothing in it can run.
  return svg ? <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="QR code that opens ReelMind on your phone, connected to this computer" className="size-[148px] rounded-lg border bg-white p-1.5" /> : <div className="size-[148px] rounded-lg border bg-muted" />;
}

function Steps({ title, children, open: initial = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="rounded-lg bg-muted text-[13px]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left font-medium">
        {title}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 leading-relaxed">{children}</div>}
    </div>
  );
}

const code = (t: string) => <code className="rounded bg-background px-1 font-mono text-[12px]">{t}</code>;

export function PhoneSection() {
  const { health, ready } = useBatch();
  const cloud = useCloud();
  const [copied, setCopied] = useState(false);
  const remote = ready ? health?.remote : undefined;
  const site = typeof window !== 'undefined' ? window.location.origin : LINKS.repo;
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone className="size-4" /> Use on your phone
      </h3>
      <p className="text-[13px] text-muted-foreground">
        Share a reel from the Instagram app straight to ReelMind. If your computer is reachable it's analyzed right away; if not, it waits and your computer analyzes it the next time its helper runs.
        {cloud.configured && !cloud.user ? ' Turn on sync above first, on this computer and your phone.' : ''}
      </p>

      {remote?.link ? (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
          <Qr text={remote.link} />
          <div className="min-w-[200px] flex-1 text-[13px]">
            <p className="font-medium text-success">Phone access is on</p>
            <p className="mt-1 text-muted-foreground">Scan this with your phone's camera once. Your phone then reaches this computer from anywhere, while it's on and the helper is running.{cloud.user ? ' Signed-in phones also find it on their own.' : ''}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={async () => {
                await navigator.clipboard.writeText(remote.link!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />} Copy phone link
            </Button>
          </div>
        </div>
      ) : (
        <Steps title={remote?.status === 'error' ? 'Phone access could not start' : 'Analyze from your phone while away (optional)'} open={remote?.status === 'error'}>
          {remote?.error && <p className="mb-2 text-destructive">{remote.error}</p>}
          <ol className="list-decimal space-y-1 pl-4">
            <li>Install cloudflared (free): {code('winget install --id Cloudflare.cloudflared')} on Windows, or {code('brew install cloudflared')} on a Mac.</li>
            <li>Add {code('REELMIND_TUNNEL=on')} to {code('helper/.env')} and restart the helper.</li>
            <li>A QR code appears here. Scan it with your phone.</li>
          </ol>
          <p className="mt-2 text-muted-foreground">Prefer a fixed address? Use Tailscale Serve and set {code('REELMIND_PUBLIC_URL')} instead. Everything through it still needs your connect code.</p>
        </Steps>
      )}

      <Steps title="Android: share from Instagram">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Open {site.replace(/^https?:\/\//, '')} in Chrome on your phone and sign in (Settings, Sync).</li>
          <li>Chrome menu, then Install app (or Add to Home screen).</li>
          <li>In Instagram, open a reel, tap Share, then ReelMind (look under More the first time).</li>
        </ol>
      </Steps>
      <Steps title="iPhone: share from Instagram">
        <ol className="list-decimal space-y-1 pl-4">
          <li>In Safari open {site.replace(/^https?:\/\//, '')}, sign in (Settings, Sync), then Share, Add to Home Screen.</li>
          <li>Open the Shortcuts app, tap +, name it "Send to ReelMind".</li>
          <li>Tap the info button and turn on Show in Share Sheet; set it to receive URLs and Text.</li>
          <li>Add the action URL Encode (input: Shortcut Input), then the action Open URLs with {code(`${site}/share?text=`)} followed by the URL Encoded Text.</li>
          <li>In Instagram tap Share, then Share to…, then Send to ReelMind.</li>
        </ol>
      </Steps>
    </section>
  );
}
