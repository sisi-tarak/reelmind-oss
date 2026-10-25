#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { phoneLink, startTunnel } from './tunnel.js';
import { config } from './config.js';
import { createServer, VERSION } from './server.js';
import { detectTools } from './tools.js';
import { repairCreators } from './store.js';

// First run: no key anywhere and someone at the keyboard. Ask once and save it to helper/.env.
async function firstRunSetup() {
  if (config.demo || config.gemini.apiKey || config.claude.apiKey || !process.stdin.isTTY) return;
  const helperDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envFile = path.join(helperDir, '.env');
  console.log('\n  Welcome to ReelMind. The helper needs a free Gemini API key to analyze reels.');
  console.log('  Get one in a minute at https://aistudio.google.com/apikey\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = (await rl.question('  Paste your Gemini key (or press Enter to skip): ')).trim();
  rl.close();
  if (!key) {
    console.log('  Skipped. You can add GEMINI_API_KEY to helper/.env later.\n');
    return;
  }
  const template = existsSync(envFile) ? readFileSync(envFile, 'utf8') : existsSync(path.join(helperDir, '.env.example')) ? readFileSync(path.join(helperDir, '.env.example'), 'utf8') : 'GEMINI_API_KEY=\n';
  const next = /^GEMINI_API_KEY=.*$/m.test(template) ? template.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${key}`) : `${template}\nGEMINI_API_KEY=${key}\n`;
  writeFileSync(envFile, next, { mode: 0o600 });
  config.gemini.apiKey = key;
  console.log('  Saved to helper/.env (never uploaded anywhere).\n');
}

function openInBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } catch {
    /* the link is printed above anyway */
  }
}

await firstRunSetup();
const { app, code } = createServer();

// Listen on both IPv4 and IPv6 loopback, so "localhost" works in every browser. Never on the network.
const ipv4 = app.listen(config.port, '127.0.0.1', async () => {
  // Quietly fix creator names saved as numbers by older versions.
  if (!config.demo) repairCreators().catch(() => undefined);
  const tools = await detectTools();
  const ok = (v) => (v ? 'ok' : 'missing');
  const lines = [
    '',
    `  ReelMind helper ${VERSION}${config.demo ? '  (demo mode: no downloads, no AI calls)' : ''}`,
    '',
    config.serveWeb ? `  Open the app:      http://localhost:${config.port}` : `  Open the app:      ${config.appUrl}/#connect=${code}`,
    config.serveWeb ? `  Or the hosted app: ${config.appUrl}/#connect=${code}` : '  (Fully offline instead? Stop this and run "npm start".)',
    `  Connect code:      ${code}`,
    '',
    `  yt-dlp   ${ok(tools.ytdlp.found)}${tools.ytdlp.version ? ` (${tools.ytdlp.version})` : ''}`,
    `  ffmpeg   ${ok(tools.ffmpeg.found)}`,
    `  Gemini   ${config.gemini.apiKey ? `${config.gemini.apiKeys.length > 1 ? `${config.gemini.apiKeys.length} keys` : 'key'} set, ${config.gemini.model}, ${config.gemini.rpm * config.gemini.apiKeys.length}/min` : 'no key (add GEMINI_API_KEY to helper/.env)'}`,
    `  Claude   ${config.claude.apiKey ? `key set, ${config.claude.model}` : 'optional (add ANTHROPIC_API_KEY to helper/.env)'}`,
    `  Cache    ${config.dataDir}`,
    '',
    config.publicUrl ? `  Phone link:        ${phoneLink(code)}` : config.tunnel ? '  Phone access:      starting a secure tunnel…' : '  Phone access:      off (add REELMIND_TUNNEL=on to helper/.env to use ReelMind from your phone while away)',
    '',
    '  Nothing is downloaded or analyzed until you click Analyze in the app.',
    '  Keep this window open while you use ReelMind.',
    '',
  ];
  console.log(lines.join('\n'));
  // Started from the desktop shortcut: open the app, already connected.
  if (process.argv.includes('--open')) openInBrowser(config.serveWeb ? `http://localhost:${config.port}` : `${config.appUrl}/#connect=${code}`);
  startTunnel((url) => {
    console.log(['', `  Phone access is on: ${url}`, `  Phone link:        ${phoneLink(code)}`, '  Open that link on your phone once (or scan the QR code in the app, Settings, Use on your phone).', '  The link changes each time the helper starts.', ''].join('\n'));
  });
});

ipv4.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Is another helper running? Set PORT in helper/.env to change it.`);
    process.exit(1);
  }
  throw error;
});

const ipv6 = app.listen(config.port, '::1');
ipv6.on('error', () => {
  /* No IPv6 loopback on this machine: IPv4 is enough. */
});
