# Security policy

## Reporting a vulnerability

Please **don't** report security problems in public issues.

Report them privately through GitHub: open the repository's **Security** tab, then choose **Report a vulnerability**. That opens a private advisory that only the maintainers can see. Include:
- what the problem is and what an attacker could do with it
- steps to reproduce, or a proof of concept
- the version (shown when the helper starts) and your setup

You'll get a reply within 7 days. Once a fix is released, you'll be credited in the advisory unless you'd rather stay anonymous.

## Supported versions

Only the latest release on `main` gets security fixes.

## What's in scope

- The helper (`helper/`): connect-code checks, CORS and origin handling, the phone tunnel, file paths and the cache.
- The web app (`web/`): anything that could leak keys, notes or the connect code, or run untrusted content.
- The extension (`extension/`).
- `firestore.rules` for optional sync.

## How ReelMind protects you

**The helper:**
- It listens only on your computer.
- Requests from websites other than `localhost` need the connect code.
- Requests through a tunnel always need the connect code.

**Your keys and data:**
- API keys live only in `helper/.env` and are never sent to the browser.
- Sync, when you turn it on, stores data in your own Firebase project under your user id, readable only by you.

**What you should keep private:**
- your `.env` files
- `cookies.txt`
- your connect code (delete `data/connect-code.txt` and restart the helper to get a new one)
