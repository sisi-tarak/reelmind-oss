import { addToList, REEL_URL, send } from './shared.js';

// The toolbar icon opens the side panel, which stays open while you move between reels.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  const menu = (id, title) => chrome.contextMenus.create({ id, title, contexts: ['link', 'page'], documentUrlPatterns: ['https://www.instagram.com/*'] });
  menu('reelmind-send', 'Send to ReelMind');
  menu('reelmind-analyze', 'Send to ReelMind and analyze');
  menu('reelmind-list', 'Add to ReelMind list');
});

function toast(tabId, text, ok) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'reelmind-toast', text, ok }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = [info.linkUrl, info.pageUrl].find((u) => u && REEL_URL.test(u));
  if (!url) return toast(tab?.id, 'That is not a reel or post link.', false);
  try {
    if (info.menuItemId === 'reelmind-list') {
      const n = await addToList([{ url }]);
      return toast(tab?.id, n ? 'Added to your ReelMind list.' : 'Already on your list.', true);
    }
    const result = await send(url, { analyze: info.menuItemId === 'reelmind-analyze' });
    toast(tab?.id, result.message, true);
  } catch (error) {
    toast(tab?.id, error.message, false);
  }
});

// The page script can't reach localhost itself, so it asks here.
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'reelmind-send') {
    send(message.url, { analyze: Boolean(message.analyze), creator: message.creator || '' })
      .then((result) => reply({ ok: true, message: result.message }))
      .catch((error) => reply({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'reelmind-add') {
    addToList([{ url: message.url, creator: message.creator }])
      .then((n) => reply({ ok: true, message: n ? 'Added to your ReelMind list.' : 'Already on your list.' }))
      .catch((error) => reply({ ok: false, message: error.message }));
    return true;
  }
  return false;
});
