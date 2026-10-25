# ReelMind browser extension

Send Instagram reels to your ReelMind helper, one at a time or in bulk. The extension opens as a **side panel** that stays open while you move between reels, so it never closes after a send.

## Install (Chrome, Edge, Brave)

1. Start the helper: `npm run helper`. Note the connect code it prints.
2. Get the extension: download `reelmind-extension-<version>.zip` from the [latest release](https://github.com/sisi-tarak/reelmind-oss/releases/latest) and unzip it, or use the `extension` folder of this repository. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder. If you installed an older version, click the reload icon on its card instead.
3. Click the ReelMind icon in the toolbar. The side panel opens. Open **Connection**, paste the connect code and click **Save**.

## Use

- **One reel:** on any reel page, click **Send** or **Analyze now** in the side panel, or in the small bar at the bottom right of the page.
- **Many reels:** click **+ Add to list** (or **+ List** in the page bar) on each reel as you scroll, then **Send all** or **Send all and analyze**.
- **A whole page:** open your Saved page or a profile, scroll to load the reels you want, and click **Add all on this page**. Scroll further and click again to add more.
- Right-click any reel link for **Send to ReelMind**, **Send and analyze**, or **Add to ReelMind list**.

The list is kept if you close the panel or the browser. Reels already analyzed are never analyzed again.

The extension only talks to your own helper on `localhost:5317`. It reads only reel links and the creator name from Instagram pages, and sends nothing anywhere else.
