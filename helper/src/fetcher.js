// Downloads a reel's video, caption and thumbnail with yt-dlp.
// Already-downloaded reels are reused, so a retry or re-analysis never downloads twice.
import path from 'node:path';
import { config } from './config.js';
import { ensureReelDir, findVideo, readInfo } from './store.js';
import { detectTools, run } from './tools.js';

function cookieArgs() {
  if (config.ytdlp.cookiesFile) return ['--cookies', config.ytdlp.cookiesFile];
  if (config.ytdlp.cookiesBrowser) return ['--cookies-from-browser', config.ytdlp.cookiesBrowser];
  return [];
}

// Turns yt-dlp's stderr into one line a person can act on.
export function explainYtdlpError(stderr) {
  const text = String(stderr || '');
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('ERROR'))
      .pop() || text.trim().split('\n').pop() || 'Unknown download error';
  const lower = line.toLowerCase();
  if (lower.includes('login') || lower.includes('cookies') || lower.includes('rate-limit') || lower.includes('401')) {
    return 'Instagram asked for a login. Set YTDLP_COOKIES_BROWSER in helper/.env to the browser you use Instagram in.';
  }
  if (lower.includes('not available') || lower.includes('404') || lower.includes('private')) {
    return 'This reel is private, deleted or not available in your region.';
  }
  if (lower.includes('unable to download webpage') || lower.includes('unable to connect') || lower.includes('timed out')) {
    return "Couldn't reach Instagram. Check your internet connection and try again.";
  }
  if (lower.includes('no video formats')) {
    return 'No video found in this post. It may be a photo or carousel.';
  }
  return line.replace(/^ERROR:\s*/, '').slice(0, 300);
}

/**
 * @returns {Promise<{ videoPath: string|null, info: object|null, captionOnly: boolean }>}
 */
export async function fetchReel(reel) {
  const existingVideo = await findVideo(reel.shortcode);
  const existingInfo = await readInfo(reel.shortcode);
  if (existingVideo && existingInfo) return { videoPath: existingVideo, info: existingInfo, captionOnly: false };

  const tools = await detectTools();
  if (!tools.ytdlp.found) {
    throw new Error('yt-dlp is not installed. Install it (see README), then click Analyze again.');
  }

  const dir = await ensureReelDir(reel.shortcode);
  const outTemplate = path.join(dir, 'video.%(ext)s');
  const format = tools.ffmpeg.found ? 'b[height<=720][ext=mp4]/bv*[height<=720]+ba/b' : 'b[ext=mp4]/b';

  const args = [
    '--no-playlist',
    '--no-progress',
    '--no-warnings',
    '-f',
    format,
    '--write-info-json',
    '--write-thumbnail',
    ...(tools.ffmpeg.found ? ['--merge-output-format', 'mp4', '--convert-thumbnails', 'jpg'] : []),
    ...cookieArgs(),
    '-o',
    outTemplate,
    reel.url,
  ];

  const result = await run(config.ytdlp.bin, args);
  const videoPath = await findVideo(reel.shortcode);
  const info = await readInfo(reel.shortcode);
  if (result.code === 0 && videoPath) return { videoPath, info, captionOnly: false };

  // Video failed. Try to get at least the caption, so a photo post or blocked video can still be analyzed.
  if (!info) {
    const meta = await run(config.ytdlp.bin, [
      '--skip-download',
      '--write-info-json',
      '--no-warnings',
      ...cookieArgs(),
      '-o',
      outTemplate,
      reel.url,
    ]);
    const captionInfo = await readInfo(reel.shortcode);
    if (meta.code === 0 && captionInfo?.caption) return { videoPath: null, info: captionInfo, captionOnly: true };
  } else if (info.caption) {
    return { videoPath: null, info, captionOnly: true };
  }

  throw new Error(explainYtdlpError(result.stderr));
}
