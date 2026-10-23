// Builds the "Try with sample reels" data bundled into the web app, from the helper's demo notes.
// Run: node scripts/make-sample.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoAnalysis, demoInfo } from '../helper/src/demo.js';
import { demoEmbedding } from '../helper/src/boards.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exported = JSON.parse(fs.readFileSync(path.join(root, 'examples/sample_saved_posts.json'), 'utf8'));
const DAY = 86400000;

const reels = exported.saved_saved_media.map((m, i) => {
  const url = m.string_map_data['Saved on'].href;
  const shortcode = url.split('/reel/')[1].replace(/\/$/, '');
  // Spread saves over the last 10 days, relative to whenever the sample is loaded.
  return { shortcode, url, creator: m.title, savedOffsetMs: Math.round(i * 0.6 * DAY) };
});

const analyses = reels.map((r, i) => {
  const a = demoAnalysis({ shortcode: r.shortcode, creator: r.creator }, i);
  return { shortcode: r.shortcode, ...a, creator: r.creator, caption: demoInfo(r).caption, durationSec: 45, captionOnly: false, hasThumb: false, promptVersion: 3 };
});

const embeddings = analyses.map((a) => ({ shortcode: a.shortcode, values: demoEmbedding(a) }));

fs.writeFileSync(path.join(root, 'web/src/lib/sample-data.json'), JSON.stringify({ reels, analyses, embeddings }));
console.log(`Wrote ${reels.length} sample reels.`);
