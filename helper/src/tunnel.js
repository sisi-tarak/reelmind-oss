// Use ReelMind from your phone while this computer is at home.
//   REELMIND_TUNNEL=on        starts a free Cloudflare quick tunnel (needs "cloudflared" installed);
//                             the address changes each time the helper starts.
//   REELMIND_PUBLIC_URL=...   a fixed HTTPS address you set up yourself (Tailscale Serve, or a named Cloudflare tunnel).
// Either way, everything that reaches the helper through it needs your connect code.
import { spawn } from 'node:child_process';
import { config } from './config.js';

const state = { url: config.publicUrl || null, status: config.publicUrl ? 'fixed' : 'off', error: null, child: null };

export function remoteState() {
  return { url: state.url, status: state.status, error: state.error };
}

/** The phone link: opens the hosted app, connects it to this helper, and points it at the tunnel. */
export function phoneLink(code) {
  if (!state.url) return null;
  return `${config.appUrl}/#connect=${code}&helper=${encodeURIComponent(state.url)}`;
}

export function startTunnel(onUrl) {
  if (state.url || !config.tunnel) return;
  state.status = 'starting';
  let child;
  try {
    child = spawn(config.cloudflaredBin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${config.port}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    state.status = 'error';
    state.error = error.message;
    return;
  }
  state.child = child;
  const watch = (chunk) => {
    const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !state.url) {
      state.url = match[0];
      state.status = 'on';
      onUrl?.(state.url);
    }
  };
  child.stdout.on('data', watch);
  child.stderr.on('data', watch);
  child.on('error', (error) => {
    state.status = 'error';
    state.error = error.code === 'ENOENT' ? 'cloudflared is not installed. Install it with "winget install --id Cloudflare.cloudflared" (Windows) or "brew install cloudflared" (Mac).' : error.message;
    console.log(`\n  Phone access: ${state.error}\n`);
  });
  child.on('exit', () => {
    if (state.status === 'on') console.log('\n  Phone access stopped (the tunnel closed). Restart the helper to get a new phone link.\n');
    state.url = null;
    if (state.status !== 'error') state.status = 'off';
  });
  const stop = () => child.kill();
  process.once('exit', stop);
  process.once('SIGINT', () => {
    stop();
    process.exit(0);
  });
}
