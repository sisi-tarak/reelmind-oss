# Contributing to ReelMind

Thanks for helping! Bug reports, ideas, docs, translations and code are all welcome.

## Ground rules

- **Be kind.** Assume good intent, keep feedback about the work, and help newcomers.
- **Keep it local-first.** Reels, notes and keys stay on the user's computer. Features must not send user data to new servers without a clear opt-in.
- **Respect Instagram and creators.**
  - Nothing should download content on a server.
  - Nothing should scrape accounts the user doesn't own.
  - Nothing should help redistribute videos.
- **Never commit secrets.** That means `.env` files, API keys, `cookies.txt` and anything under `data/`.

## Reporting a bug

Check [existing issues](https://github.com/sisi-tarak/reelmind-oss/issues) first, then open a **Bug report** and include:
- what you did, what you expected, and what happened
- your OS, browser, Node version (`node -v`) and ReelMind version (shown when the helper starts)
- the helper's terminal output and any browser console errors
- remove any keys, connect codes or personal links before posting

**Security problems:** don't open a public issue. Follow [SECURITY.md](SECURITY.md) instead.

## Suggesting a feature

Open a **Feature request**. Explain the problem it solves and who it helps, not just the solution. Small, focused ideas get built fastest.

## Setting up for development

You need Node.js 22+. yt-dlp and ffmpeg are only needed for real downloads; demo mode works without them.

```bash
git clone https://github.com/<you>/reelmind-oss.git
cd reelmind-oss
npm install
npm run dev:demo      # demo helper (no keys, no downloads) + app at http://localhost:5173
```

In demo mode, click **Try with 16 sample reels** to get a full board without any AI calls.

To work with real reels, add a Gemini key to `helper/.env` (copy `helper/.env.example`) and run `npm run dev`.

## Making a change

1. Create a branch from `main`: `git checkout -b fix/short-description`.
2. Keep each pull request to one change, and match the style of the surrounding code.
3. Add or update tests when you change behaviour:
   - web: Vitest in `web/src/**/*.test.ts`
   - helper: Node's test runner in `helper/test/`
4. Run the checks before pushing:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
5. For UI changes, check both a desktop width and a phone width (390px), and add before/after screenshots to the pull request.
6. Write clear commit messages in the imperative: "Fix duplicate reels after re-import".

## Project layout

- `web/` is the React app (Vite, TypeScript, Tailwind, shadcn/ui, React Flow, Dexie).
- `helper/` is the local Node helper (Express, yt-dlp, Gemini/Claude).
- `extension/` is the browser extension (Manifest V3).

The [README](README.md#development) has a fuller map.

## Writing in the interface

- Use plain, friendly English in sentence case.
- Say what happened and what to do next ("The helper isn't running. Start it with `npm run helper`.").
- Avoid jargon and exclamation marks.

## Licence of contributions

ReelMind is licensed under [AGPL-3.0](LICENSE). By submitting a pull request, you agree that your contribution is licensed under the same terms.
