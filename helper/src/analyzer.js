// Turns one reel into structured study notes with the chosen AI provider.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { aiJson, modelName } from './ai.js';
import { config } from './config.js';
import { ANALYSIS_SCHEMA, buildPrompt, normalizeAnalysis } from './prompt.js';
import { detectTools, run } from './tools.js';

export { RateLimitError, sleep } from './ai.js';

const MAX_FRAMES = 8;

// Claude can't take video, so it gets evenly spaced still frames instead. Frames are cached.
async function extractFrames(videoPath, durationSec) {
  const dir = path.join(path.dirname(videoPath), 'frames');
  if (existsSync(dir)) {
    const cached = (await fs.readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    if (cached.length) return Promise.all(cached.map((f) => fs.readFile(path.join(dir, f), { encoding: 'base64' })));
  }
  const tools = await detectTools();
  if (!tools.ffmpeg.found) return [];
  await fs.mkdir(dir, { recursive: true });
  const every = Math.max(1, (durationSec || 40) / MAX_FRAMES);
  await run(config.ffmpegBin, ['-loglevel', 'error', '-i', videoPath, '-vf', `fps=1/${every.toFixed(2)},scale=768:-2`, '-frames:v', String(MAX_FRAMES), '-q:v', '4', path.join(dir, 'frame-%02d.jpg')]);
  const frames = (await fs.readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
  return Promise.all(frames.map((f) => fs.readFile(path.join(dir, f), { encoding: 'base64' })));
}

/**
 * @param {{ provider: 'gemini'|'claude', videoPath: string|null, caption: string, creator: string, captionOnly: boolean,
 *           durationSec?: number|null, prior?: object|null, signal?: AbortSignal }} input
 */
export async function analyzeReel({ provider, videoPath, caption, creator, captionOnly, durationSec, prior, signal }) {
  let source = 'caption';
  let images = [];
  if (!captionOnly && videoPath) {
    if (provider === 'claude') {
      images = await extractFrames(videoPath, durationSec);
      source = images.length ? 'frames' : 'caption';
    } else {
      source = 'video';
    }
  }
  const prompt = buildPrompt({
    caption,
    creator,
    source,
    transcript: provider === 'claude' ? prior?.transcript || '' : '',
    onScreenText: provider === 'claude' ? prior?.onScreenText || '' : '',
  });
  const raw = await aiJson({ provider, prompt, schema: ANALYSIS_SCHEMA, videoPath: source === 'video' ? videoPath : null, images, signal });
  const analysis = normalizeAnalysis(raw);
  // Claude can't hear audio: keep the earlier transcript rather than losing it.
  if (provider === 'claude' && !analysis.transcript && prior?.transcript) analysis.transcript = prior.transcript;
  return { ...analysis, model: modelName(provider), provider, source };
}
