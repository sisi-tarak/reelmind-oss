# Changelog

All notable changes to ReelMind are listed here. Versions follow [Semantic Versioning](https://semver.org): 1.0.1 for fixes, 1.1.0 for new features, 2.0.0 for changes that break existing setups.

## [Unreleased]

Nothing yet.

## [1.0.0] - 2026-10-25

The first public release.

### Bring in your reels
- Import Instagram's data export (ZIP, JSON or HTML) or paste reel links. Collection names are kept.
- Reels are recognised by their shortcode, so nothing is ever analyzed twice.
- You choose which reels to analyze. Batches can be resumed, and finished reels are always kept.
- Share reels from the Instagram app on your phone (installable app on Android, a Shortcut on iPhone).
- Browser extension side panel: send the reel you're watching, or collect a whole Saved page.

### See how it connects
- A workflow board: Saved reels → topics → reels → tools, with each topic on its own note.
- Reels about the same idea are linked by meaning, with the reason shown.
- View and Edit modes with undo and redo, a saved layout and Reset.
- Hover cards, click to focus, search and filters, a timeline, and a 3D view.

### Learn it
- Notes for each reel: summary, infographic, key points, a practice task and transcript.
- Topic boards, a weekly recap and quiz, and daily flashcard review with spaced repetition.
- A library of Claude skills, prompts, code, workflows and tools found in your reels. Copy, download or customize each one.
- A history of every AI result, compressed in your browser.

### Take it anywhere
- Export as PNG, JPG, PDF, Word, Excel or Markdown. Share cards and read-only share links.
- Backup and restore, plus optional sync across devices with your own Firebase project.

### Setup and reliability
- Windows double-click installer, desktop shortcut and updater.
- Up to 5 Gemini keys that take turns, plus optional Claude.
- When Gemini is overloaded (Google's 503 "high demand"), ReelMind retries and keeps the reel queued instead of failing it.
- Optional phone access through a secure tunnel, protected by your connect code.

[Unreleased]: https://github.com/sisi-tarak/reelmind-oss/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sisi-tarak/reelmind-oss/releases/tag/v1.0.0
