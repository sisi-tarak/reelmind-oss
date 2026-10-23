// Finds the external programs the helper depends on and runs them without a shell.
import { spawn } from 'node:child_process';
import { config } from './config.js';

export function run(bin, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: -1, stdout, stderr: String(error), missing: true });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(error), missing: error.code === 'ENOENT' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

let cached = null;

export async function detectTools({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  const [ytdlp, ffmpeg] = await Promise.all([
    run(config.ytdlp.bin, ['--version'], { timeoutMs: 15000 }),
    run(config.ffmpegBin, ['-version'], { timeoutMs: 15000 }),
  ]);
  cached = {
    ytdlp: { found: ytdlp.code === 0, version: ytdlp.code === 0 ? ytdlp.stdout.trim() : null },
    ffmpeg: { found: ffmpeg.code === 0 },
  };
  return cached;
}
