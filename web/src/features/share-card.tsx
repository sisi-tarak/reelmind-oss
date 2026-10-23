// Image cards sized for social posts. Drawn as HTML at full size, then saved as a picture.
import { forwardRef } from 'react';
import { Check } from 'lucide-react';
import { moodFor } from '@/lib/emotion';
import { takeaways, type SummaryItem } from '@/lib/summary';
import { topicLabel } from '@/lib/topics';
import type { TopicBoard } from '@/lib/types';
import { Infographic } from './infographic';

export type CardSize = 'post' | 'story' | 'square' | 'wide';
export const CARD_SIZES: Record<CardSize, { w: number; h: number; label: string; hint: string }> = {
  post: { w: 1080, h: 1350, label: 'Instagram post', hint: '4:5' },
  story: { w: 1080, h: 1920, label: 'Story or status', hint: '9:16' },
  square: { w: 1080, h: 1080, label: 'Square', hint: 'WhatsApp, X' },
  wide: { w: 1200, h: 627, label: 'LinkedIn', hint: '1.91:1' },
};

export interface CardContent {
  kind: 'reel' | 'topic' | 'summary';
  title: string;
  items: SummaryItem[];
  board?: TopicBoard;
}

function dominant(items: SummaryItem[]) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.analysis.contentType, (counts.get(i.analysis.contentType) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
}

function Brand({ color, big }: { color: string; big: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: big ? 26 : 20 }}>
      <div className="flex items-center gap-3 font-semibold">
        <svg viewBox="0 0 32 32" style={{ width: big ? 40 : 30, height: big ? 40 : 30 }} aria-hidden>
          <rect width="32" height="32" rx="8" fill="#1f2430" />
          <rect x="7" y="8" width="10" height="16" rx="2.5" fill="none" stroke="#ffd84d" strokeWidth="2" />
          <circle cx="23" cy="11" r="2.5" fill="#ffd84d" />
          <circle cx="23" cy="21" r="2.5" fill="#fff" />
          <path d="M17 13.5 20.8 11.6M17 18.5l3.8 1.9" stroke="#fff" strokeWidth="1.6" />
        </svg>
        Notes made with ReelMind
      </div>
      <span style={{ width: big ? 56 : 40, height: 6, borderRadius: 3, background: color }} />
    </div>
  );
}

export const ShareCard = forwardRef<HTMLDivElement, { content: CardContent; size: CardSize }>(function ShareCard({ content, size }, ref) {
  const { w, h } = CARD_SIZES[size];
  const wide = size === 'wide';
  const big = !wide;
  const lead = content.items[0];
  const mood = moodFor(content.kind === 'reel' && lead ? lead.analysis.contentType : dominant(content.items));
  const Icon = mood.icon;
  const pad = wide ? 56 : 80;
  const titleSize = wide ? 44 : size === 'story' ? 76 : 64;
  const bodySize = wide ? 22 : size === 'story' ? 38 : 32;

  let body: React.ReactNode = null;
  if (content.kind === 'reel' && lead) {
    const a = lead.analysis;
    const points = a.keyPoints.slice(0, size === 'story' ? 5 : wide ? 3 : 4);
    body = (
      <>
        <ul className="flex flex-col" style={{ gap: wide ? 12 : 22, fontSize: bodySize }}>
          {points.map((p, i) => (
            <li key={i} className="flex items-start" style={{ gap: wide ? 14 : 20, lineHeight: 1.3 }}>
              <span className="flex shrink-0 items-center justify-center rounded-full text-white" style={{ background: mood.color, width: wide ? 30 : 44, height: wide ? 30 : 44, marginTop: wide ? 0 : 2 }}>
                <Check style={{ width: wide ? 18 : 26, height: wide ? 18 : 26 }} strokeWidth={3} />
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {!wide && size !== 'square' && a.infographic.items.length + a.infographic.rows.length > 0 && (
          <div className="rounded-3xl border-2 bg-white" style={{ borderColor: mood.edge, padding: 36, zoom: 1.7 } as React.CSSProperties}>
            <Infographic data={a.infographic} accent={mood.color} />
          </div>
        )}
      </>
    );
  } else if (content.kind === 'topic' && content.board?.learningPath.length) {
    body = (
      <ol className="flex flex-col" style={{ gap: wide ? 12 : 22, fontSize: bodySize }}>
        {content.board.learningPath.slice(0, size === 'story' ? 7 : wide ? 4 : 5).map((s, i) => (
          <li key={i} className="flex items-start" style={{ gap: wide ? 14 : 20, lineHeight: 1.25 }}>
            <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ background: mood.color, width: wide ? 34 : 50, height: wide ? 34 : 50, fontSize: wide ? 18 : 26 }}>
              {i + 1}
            </span>
            <span>
              <span className="font-semibold">{s.title}</span>
              {!wide && <span className="block" style={{ color: '#667085', fontSize: bodySize * 0.8 }}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    );
  } else if (content.kind === 'topic') {
    // No topic board yet: each reel's title and its main point.
    const list = content.items.slice(0, size === 'story' ? 7 : wide ? 3 : 5);
    body = (
      <ul className="flex flex-col" style={{ gap: wide ? 12 : 24, fontSize: bodySize }}>
        {list.map((it) => (
          <li key={it.reel.shortcode} className="flex items-start" style={{ gap: wide ? 14 : 20, lineHeight: 1.25 }}>
            <span className="shrink-0 rounded-full" style={{ background: moodFor(it.analysis.contentType).color, width: wide ? 14 : 20, height: wide ? 14 : 20, marginTop: wide ? 8 : 12 }} />
            <span>
              <span className="font-semibold">{it.analysis.title}</span>
              {!wide && it.analysis.keyPoints[0] && <span className="block" style={{ color: '#667085', fontSize: bodySize * 0.8 }}>{it.analysis.keyPoints[0]}</span>}
            </span>
          </li>
        ))}
        {content.items.length > list.length && <li style={{ color: '#667085', fontSize: bodySize * 0.8 }}>and {content.items.length - list.length} more</li>}
      </ul>
    );
  } else {
    const ideas = takeaways(content.items, size === 'story' ? 6 : wide ? 3 : 4);
    const topics = new Map<string, number>();
    for (const i of content.items) topics.set(i.analysis.primaryTopic, (topics.get(i.analysis.primaryTopic) || 0) + 1);
    const top = [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, wide ? 4 : 6);
    body = (
      <>
        {content.kind === 'summary' && top.length > 1 && (
          <div className="flex flex-wrap" style={{ gap: wide ? 10 : 16 }}>
            {top.map(([t, n]) => (
              <span key={t} className="rounded-full bg-white font-medium" style={{ border: `2px solid ${mood.edge}`, padding: wide ? '6px 16px' : '10px 24px', fontSize: bodySize * 0.85 }}>
                {topicLabel(t)} <span style={{ color: '#667085' }}>{n}</span>
              </span>
            ))}
          </div>
        )}
        <ul className="flex flex-col" style={{ gap: wide ? 12 : 22, fontSize: bodySize }}>
          {ideas.map((t, i) => {
            const m = moodFor(t.item.analysis.contentType);
            return (
              <li key={i} className="flex items-start" style={{ gap: wide ? 14 : 20, lineHeight: 1.3 }}>
                <span className="shrink-0 rounded-full" style={{ background: m.color, width: wide ? 14 : 20, height: wide ? 14 : 20, marginTop: wide ? 8 : 12 }} />
                <span>{t.text}</span>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const meta =
    content.kind === 'reel' && lead
      ? `${mood.label}${lead.reel.creator ? `, from @${lead.reel.creator}` : ''}`
      : `${content.items.length} ${content.items.length === 1 ? 'reel' : 'reels'}${content.kind === 'topic' ? ', one topic' : ''}`;

  return (
    <div
      ref={ref}
      className="flex flex-col overflow-hidden font-sans text-foreground"
      style={{ width: w, height: h, padding: pad, gap: wide ? 24 : 44, background: `linear-gradient(180deg, ${mood.tint} 0%, #ffffff 70%)` }}
    >
      <div className="flex items-center" style={{ gap: 16 }}>
        <span className="flex items-center rounded-full font-semibold text-white" style={{ background: mood.color, gap: 10, padding: wide ? '8px 18px' : '12px 26px', fontSize: wide ? 20 : 28 }}>
          <Icon style={{ width: wide ? 22 : 30, height: wide ? 22 : 30 }} />
          {content.kind === 'topic' ? 'Topic' : content.kind === 'summary' ? 'Summary' : mood.label}
        </span>
        <span style={{ color: '#667085', fontSize: wide ? 20 : 28 }}>{meta}</span>
      </div>
      <h1 className="font-semibold" style={{ fontSize: titleSize, lineHeight: 1.08, letterSpacing: '-0.025em' }}>
        {content.title}
      </h1>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ gap: wide ? 20 : 40 }}>
        {body}
      </div>
      <Brand color={mood.color} big={big} />
    </div>
  );
});
