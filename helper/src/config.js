import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

const env = process.env;
const demo = process.argv.includes('--demo') || env.REELMIND_DEMO === '1';
// Up to five Gemini keys (each from a different Google Cloud project, so each has its own free quota).
const geminiKeys = [
  env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4,
  env.GEMINI_API_KEY_5,
  ...(env.GEMINI_API_KEYS || '').split(','),
]
  .map((k) => (k || '').trim())
  .filter((k, i, all) => k && all.indexOf(k) === i)
  .slice(0, 5);

const baseDataDir = env.REELMIND_DATA_DIR ? path.resolve(env.REELMIND_DATA_DIR) : path.join(REPO_ROOT, 'data');

export const config = {
  port: Number(env.PORT) || 5317,
  demo,
  serveWeb: process.argv.includes('--serve-web'),
  // Demo results live in their own folder so they never mix with real analyses.
  dataDir: demo ? path.join(baseDataDir, 'demo') : baseDataDir,
  webDist: path.join(REPO_ROOT, 'web', 'dist'),
  // The hosted web app. The helper prints a one-click link to connect it.
  appUrl: (env.REELMIND_APP_URL || 'https://reelmind-tau.vercel.app').replace(/\/$/, ''),
  // Which AI analyzes new reels when the app doesn't ask for one.
  defaultProvider: env.AI_PROVIDER === 'claude' ? 'claude' : 'gemini',
  gemini: {
    apiKey: geminiKeys[0] || '',
    apiKeys: geminiKeys,
    model: env.GEMINI_MODEL || 'gemini-3.8-flash',
    // Used for a reel when the main model stays overloaded (Google's 503 "high demand"). Optional.
    fallbackModel: (env.GEMINI_FALLBACK_MODEL || '').trim(),
    embedModel: env.GEMINI_EMBED_MODEL || 'gemini-embedding-2',
    rpm: Math.max(1, Number(env.GEMINI_RPM) || 8),
    embedRpm: Math.max(1, Number(env.GEMINI_EMBED_RPM) || 60),
  },
  claude: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    rpm: Math.max(1, Number(env.CLAUDE_RPM) || 20),
  },
  ytdlp: {
    bin: env.YTDLP_PATH || 'yt-dlp',
    cookiesBrowser: env.YTDLP_COOKIES_BROWSER || '',
    cookiesFile: env.YTDLP_COOKIES_FILE || '',
  },
  ffmpegBin: env.FFMPEG_PATH || 'ffmpeg',
  // Phone access while away from this computer (see tunnel.js).
  tunnel: process.argv.includes('--tunnel') || /^(on|1|true|yes)$/i.test(env.REELMIND_TUNNEL || ''),
  publicUrl: /^https:\/\//.test(env.REELMIND_PUBLIC_URL || '') ? env.REELMIND_PUBLIC_URL.replace(/\/$/, '') : '',
  cloudflaredBin: env.CLOUDFLARED_PATH || 'cloudflared',
  // Bump when the analysis prompt or schema changes, so old cards can be flagged later.
  promptVersion: 3,
};

export function providerReady(provider) {
  if (config.demo) return true;
  return provider === 'claude' ? Boolean(config.claude.apiKey) : Boolean(config.gemini.apiKey);
}
