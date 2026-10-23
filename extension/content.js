// Adds a small "Send to ReelMind" bar on reel and post pages. Instagram is a single-page app, so it watches the URL.
(() => {
  const REEL = /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,20})/;
  let bar = null;
  let current = null;

  function toast(text, ok = true) {
    const el = document.createElement('div');
    el.className = `reelmind-toast ${ok ? '' : 'reelmind-toast-error'}`;
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('reelmind-show'));
    setTimeout(() => {
      el.classList.remove('reelmind-show');
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  function creator() {
    const meta = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const m = meta.match(/@([\w.]{1,30})/) || meta.match(/^([\w.]{1,30}) on Instagram/);
    return m ? m[1] : '';
  }

  function send(action, button) {
    const url = `https://www.instagram.com${location.pathname}`;
    button.disabled = true;
    const label = button.textContent;
    button.textContent = action === 'add' ? 'Adding…' : 'Sending…';
    const message = action === 'add' ? { type: 'reelmind-add', url, creator: creator() } : { type: 'reelmind-send', url, analyze: action === 'analyze', creator: creator() };
    chrome.runtime.sendMessage(message, (reply) => {
      button.disabled = false;
      button.textContent = label;
      if (chrome.runtime.lastError) return toast('Reload the page: the extension was updated.', false);
      toast(reply?.message || 'Something went wrong.', Boolean(reply?.ok));
    });
  }

  function makeBar() {
    const el = document.createElement('div');
    el.className = 'reelmind-bar';
    el.innerHTML = '<span class="reelmind-dot"></span><button data-a="add" title="Collect it and send many at once from the side panel">+ List</button><button data-a="send">Send</button><button data-a="analyze" class="reelmind-primary">Analyze now</button>';
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => send(b.dataset.a, b)));
    return el;
  }

  function update() {
    const match = location.pathname.match(REEL);
    const id = match ? match[1] : null;
    if (id === current) return;
    current = id;
    if (!id) {
      bar?.remove();
      bar = null;
      return;
    }
    if (!bar) bar = makeBar();
    if (!bar.isConnected) document.body.appendChild(bar);
  }

  // Every reel or post linked on this page (a profile grid, your saved posts, search results).
  function collect() {
    const found = new Map();
    for (const a of document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"], a[href*="/reels/"]')) {
      let path = '';
      try {
        path = new URL(a.getAttribute('href'), location.origin).pathname;
      } catch {
        continue;
      }
      const m = path.match(REEL);
      if (m && !found.has(m[1])) found.set(m[1], { url: `https://www.instagram.com/reel/${m[1]}/` });
    }
    const here = location.pathname.match(REEL);
    if (here && !found.has(here[1])) found.set(here[1], { url: `https://www.instagram.com/reel/${here[1]}/`, creator: creator() });
    return [...found.values()];
  }

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === 'reelmind-toast') toast(message.text, message.ok);
    if (message?.type === 'reelmind-collect') reply({ reels: collect() });
    if (message?.type === 'reelmind-current') reply({ creator: creator() });
  });

  update();
  let last = location.href;
  new MutationObserver(() => {
    if (location.href !== last) {
      last = location.href;
      update();
    }
  }).observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', update);
})();
