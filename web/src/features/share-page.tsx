// The read-only page people see when they open a ReelMind share link.
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTENT_MOODS, moodFor } from '@/lib/emotion';
import { instagramUrl, PUBLIC_APP_URL, readShareLink, type SharedPayload } from '@/lib/share';
import { LINKS } from '@/lib/site';
import { topicLabel } from '@/lib/topics';
import { plural } from '@/lib/utils';

export function SharePage() {
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readShareLink(window.location.hash)
      .then((d) => {
        setData(d);
        document.title = `${d.title} | ReelMind`;
      })
      .catch((e) => setError((e as Error).message || 'This link could not be opened.'));
  }, []);

  const topics = useMemo(() => {
    const map = new Map<string, SharedPayload['reels']>();
    for (const r of data?.reels || []) {
      if (!map.has(r.p)) map.set(r.p, []);
      map.get(r.p)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  const appUrl = window.location.hostname.endsWith('vercel.app') ? window.location.origin : PUBLIC_APP_URL;

  return (
    <div className="min-h-full bg-canvas" style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1.2px, transparent 1.2px)', backgroundSize: '20px 20px' }}>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <a href={appUrl} className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" /> ReelMind
        </a>
        <span className="hidden text-[13px] text-muted-foreground sm:inline">Shared notes, read-only</span>
        <Button size="sm" variant="highlight" className="ml-auto" asChild>
          <a href={appUrl}>
            <Sparkles /> Make your own
          </a>
        </Button>
      </header>

      <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 py-10">
        {error && (
          <div className="rounded-xl border bg-background p-6">
            <h1 className="text-xl font-semibold">This link can't be opened</h1>
            <p className="mt-2 text-muted-foreground">{error} It may have been cut off when it was copied. Ask the person who shared it to send it again.</p>
          </div>
        )}
        {!data && !error && <p className="text-muted-foreground">Opening the notes…</p>}
        {data && (
          <>
            <section>
              <p className="text-[13px] font-medium text-muted-foreground">
                {plural(data.reels.length, 'saved reel')} in {plural(topics.length, 'topic')}
              </p>
              <h1 className="mt-1 text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">{data.title}</h1>
            </section>

            {data.board && (
              <section className="flex flex-col gap-4 rounded-2xl border bg-background p-6">
                <h2 className="text-[18px] font-semibold">What these reels teach together</h2>
                <p className="text-[15px] leading-relaxed">{data.board.overview}</p>
                {data.board.learningPath.length > 0 && (
                  <ol className="flex flex-col gap-3">
                    {data.board.learningPath.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">{i + 1}</span>
                        <span className="pt-0.5 text-[14.5px] leading-snug">
                          <span className="font-semibold">{s.title}.</span> <span className="text-muted-foreground">{s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {data.board.project.title && (
                  <p className="rounded-lg bg-muted px-4 py-3 text-[14px]">
                    <span className="font-semibold">Project to try: {data.board.project.title}.</span> {data.board.project.goal}
                  </p>
                )}
              </section>
            )}

            {topics.map(([topic, reels]) => (
              <section key={topic} className="flex flex-col gap-3">
                <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
                  {topicLabel(topic)} <span className="text-[14px] font-normal text-muted-foreground">{reels.length}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {reels.map((r) => {
                    const mood = moodFor(r.c);
                    const Icon = mood.icon;
                    return (
                      <article key={r.i} className="flex flex-col gap-2.5 rounded-xl border-[1.5px] bg-background p-4" style={{ borderColor: mood.edge }}>
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: mood.color }}>
                            <Icon className="size-3.5" /> {(CONTENT_MOODS[r.c] || CONTENT_MOODS.other).label}
                          </span>
                          <span className="text-muted-foreground">{r.d}</span>
                          {r.r && <span className="ml-auto truncate text-muted-foreground">@{r.r}</span>}
                        </div>
                        <h3 className="text-[16px] font-semibold leading-snug">{r.t}</h3>
                        <p className="text-[13.5px] leading-relaxed text-muted-foreground">{r.s}</p>
                        {r.k && (
                          <ul className="flex flex-col gap-1 text-[13.5px]">
                            {r.k.map((k, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: mood.color }} />
                                {k}
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.x && <p className="text-[13px]"><span className="font-semibold">Try it:</span> {r.x}</p>}
                        {r.o && (
                          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                            {r.o.map((t) =>
                              t.u ? (
                                <a key={t.n} href={t.u} target="_blank" rel="noreferrer nofollow" className="underline underline-offset-2">
                                  {t.n}
                                </a>
                              ) : (
                                <span key={t.n} className="text-muted-foreground">{t.n}</span>
                              ),
                            )}
                          </p>
                        )}
                        <a href={instagramUrl(r.i)} target="_blank" rel="noreferrer nofollow" className="mt-auto inline-flex items-center gap-1 self-start text-[13px] font-medium underline-offset-4 hover:underline">
                          Watch on Instagram <ExternalLink className="size-3" />
                        </a>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border bg-background p-6 text-center">
              <h2 className="text-[18px] font-semibold">Turn your own saved reels into notes like these</h2>
              <p className="mx-auto mt-2 max-w-[520px] text-[14px] text-muted-foreground">ReelMind is free and open source. It maps the reels you save by topic and quizzes you every week.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="highlight" asChild>
                  <a href={appUrl}>
                    <Sparkles /> Try ReelMind
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={LINKS.repo} target="_blank" rel="noreferrer">
                    View on GitHub
                  </a>
                </Button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
