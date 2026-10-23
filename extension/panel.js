// Side panel: stays open while you browse Instagram, so you can send reels one by one or collect many and send them together.
import { addToList, canonical, DEFAULTS, getList, health, send, setList, settings } from './shared.js';

const $ = (id) => document.getElementById(id);
let current = null; // { url, tabId }
let connected = false;

function say(text, error = false) {
  $('result').textContent = text;
  $('result').className = `result${error ? ' error' : ''}`;
}

async function refreshStatus() {
  const s = await settings();
  for (const key of Object.keys(DEFAULTS)) if (document.activeElement !== $(key)) $(key).value = s[key];
  $('open').href = s.appUrl;
  const status = $('status');
  try {
    const h = await health();
    connected = !h.needsCode;
    status.textContent = h.needsCode ? 'Needs code' : h.demo ? 'Demo mode' : 'Connected';
    status.className = `pill ${h.needsCode ? 'bad' : 'ok'}`;
    if (h.needsCode) $('setup').open = true;
  } catch {
    connected = false;
    status.textContent = 'Helper off';
    status.className = 'pill bad';
  }
  render();
}

async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = canonical(tab?.url);
  current = url ? { url, tabId: tab.id } : null;
  $('reel').textContent = url ? url.replace('https://www.instagram.com', '') : 'Open a reel on Instagram.';
  $('collect').disabled = !tab?.url?.startsWith('https://www.instagram.com/');
  render();
}

async function render() {
  const list = await getList();
  $('count').textContent = list.length;
  $('add').disabled = !current;
  $('send').disabled = $('analyze').disabled = !(connected && current);
  $('sendAll').disabled = $('analyzeAll').disabled = !(connected && list.length);
  $('clear').hidden = !list.length;
  const ul = $('list');
  ul.replaceChildren(
    ...list
      .slice()
      .reverse()
      .map((item) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = item.url;
        a.target = '_blank';
        a.textContent = item.url.replace('https://www.instagram.com/reel/', '').replace(/\/$/, '');
        const who = document.createElement('span');
        who.textContent = item.creator ? `@${item.creator}` : '';
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.title = 'Remove';
        remove.addEventListener('click', async () => {
          await setList((await getList()).filter((i) => i.url !== item.url));
          render();
        });
        li.append(a, who, remove);
        return li;
      }),
  );
}

async function creatorOnPage() {
  if (!current) return '';
  try {
    return (await chrome.tabs.sendMessage(current.tabId, { type: 'reelmind-current' }))?.creator || '';
  } catch {
    return '';
  }
}

async function sendCurrent(analyze) {
  say('Sending…');
  try {
    const r = await send(current.url, { analyze, creator: await creatorOnPage() });
    say(r.message);
  } catch (e) {
    say(e.message, true);
  }
}

async function sendList(analyze) {
  const list = await getList();
  if (!list.length) return;
  say(`Sending ${list.length}…`);
  try {
    // Batches of 100 keep each request small.
    let last = null;
    for (let i = 0; i < list.length; i += 100) last = await send(list.slice(i, i + 100).map((x) => x.url), { analyze });
    await setList([]);
    say(list.length === 1 ? last.message : `Sent ${list.length} reels to ReelMind.${analyze ? (last.analyzing ? ' Analyzing the new ones now.' : ` ${last.message.replace(/^Sent\.?\s*/, '')}`) : ''}`);
  } catch (e) {
    say(e.message, true);
  }
  render();
}

$('add').addEventListener('click', async () => {
  const n = await addToList([{ url: current.url, creator: await creatorOnPage() }]);
  say(n ? 'Added to the list.' : 'Already on the list.');
  render();
});
$('send').addEventListener('click', () => sendCurrent(false));
$('analyze').addEventListener('click', () => sendCurrent(true));
$('sendAll').addEventListener('click', () => sendList(false));
$('analyzeAll').addEventListener('click', () => sendList(true));
$('clear').addEventListener('click', async () => {
  await setList([]);
  say('List cleared.');
  render();
});
$('collect').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  try {
    const { reels } = await chrome.tabs.sendMessage(tab.id, { type: 'reelmind-collect' });
    const n = await addToList(reels || []);
    say(reels?.length ? `Found ${reels.length} on this page, ${n} new added. Scroll down and click again to add more.` : 'No reels found on this page. Open your Saved page or a profile.');
  } catch {
    say('Reload the Instagram page, then try again.', true);
  }
  render();
});
$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    code: $('code').value.trim(),
    helperUrl: $('helperUrl').value.trim() || DEFAULTS.helperUrl,
    appUrl: $('appUrl').value.trim() || DEFAULTS.appUrl,
  });
  say('Saved.');
  refreshStatus();
});

// Follow you as you move between reels and tabs.
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.status === 'complete')) refreshTab();
});
chrome.windows.onFocusChanged.addListener(refreshTab);
chrome.storage.onChanged.addListener((changes) => changes.list && render());

refreshTab();
refreshStatus();
setInterval(refreshStatus, 15000);
