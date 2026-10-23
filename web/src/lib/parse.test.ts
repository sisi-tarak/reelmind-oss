import { describe, expect, it } from 'vitest';
import { dedupe, extractShortcode, parseJson, parseText } from './parse';

describe('extractShortcode', () => {
  it('normalizes every common link shape to one id', () => {
    const urls = [
      'https://www.instagram.com/reel/C9xYz_12AB/',
      'https://instagram.com/reel/C9xYz_12AB?igsh=abc123',
      'instagram.com/p/C9xYz_12AB',
      'https://www.instagram.com/someuser/reel/C9xYz_12AB/?utm_source=ig_web_copy_link',
      'https://m.instagram.com/reels/C9xYz_12AB/',
    ];
    expect(new Set(urls.map(extractShortcode))).toEqual(new Set(['C9xYz_12AB']));
  });
  it('ignores profile links', () => {
    expect(extractShortcode('https://www.instagram.com/someuser/')).toBeNull();
  });
});

describe('parseJson', () => {
  it('reads saved_posts.json', () => {
    const data = {
      saved_saved_media: [
        { title: 'codewithsam', string_map_data: { 'Saved on': { href: 'https://www.instagram.com/reel/AAAAA11111/', timestamp: 1760900000 } } },
        { title: 'ai.with.anu', string_map_data: { 'Saved on': { href: 'https://www.instagram.com/p/BBBBB22222/', timestamp: 1760800000 } } },
      ],
    };
    const reels = parseJson(data);
    expect(reels).toHaveLength(2);
    expect(reels[0]).toMatchObject({ shortcode: 'AAAAA11111', creator: 'codewithsam' });
    expect(reels[0].savedAt).toBe(new Date(1760900000 * 1000).toISOString());
  });

  it('reads saved_collections.json with collection names', () => {
    const data = {
      saved_saved_collections: [
        { title: 'Collection', string_map_data: { Name: { value: 'AI tools' }, 'Creation Time': { timestamp: 1760000000 } } },
        { string_map_data: { Name: { value: 'devtipsdaily', href: 'https://www.instagram.com/reel/CCCCC33333/' }, 'Added Time': { timestamp: 1760700000 } } },
      ],
    };
    expect(parseJson(data)[0]).toMatchObject({ shortcode: 'CCCCC33333', creator: 'devtipsdaily', collections: ['AI tools'] });
  });
});

describe('dedupe', () => {
  it('collapses duplicates and keeps the earliest save date', () => {
    const a = parseText('https://instagram.com/reel/DDDDD44444 and https://www.instagram.com/reel/DDDDD44444/?x=1');
    a[1].savedAt = '2026-10-01T00:00:00.000Z';
    const { reels, duplicates } = dedupe(a);
    expect(reels).toHaveLength(1);
    expect(duplicates).toBe(1);
    expect(reels[0].savedAt).toBe('2026-10-01T00:00:00.000Z');
  });
});
