# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-24

First public release. The package was developed privately before this point, so this entry describes the complete initial feature set.

### Added

- Bookmark scopes: one reply, prompt + reply (a whole turn), a text selection, and a file.
- Bookmark icon in the assistant message action row with three states (not saved, saved as part of a turn, saved).
- Floating **Add to favorites** pill that appears after selecting transcript text.
- Favorites panel in the left sidebar: workspace grouping with collapsible headers, type filter, tag filter, session filter, workspace filter, and full-text search over titles, quotes, notes, and paths.
- Jump to a bookmark: opens the session, pages older history when the target is outside the loaded window, scrolls the target near the top of the transcript, and highlights the matched text with an amber overlay.
- Alignment keeps correcting itself after the jump, so a window resize or a late history page still lands on the target; any deliberate gesture stops it and clears the highlight.
- Notes, tags (up to 8 per entry), editing, and confirmed deletion per entry.
- Existing-tag picker inside the editor dialog so tags stay consistent across entries.
- File bookmarks with optional line range, in-panel preview, and path copy.
- Host tool `favorites` (`list` / `add` / `remove`) for agent-driven saving and lookup.
- Local JSON persistence with an atomic write, a backup copy before each write, and a browser mirror merged on load.
- Localized display metadata (English, Chinese), icon, and a single-image detail document for Plugin Manager.

### Known limitations

- Turn bookmarks created before 1.0.0 stored no prompt text, so their jump may land on the reply instead of the prompt.
- A jump can only reach messages the transcript can load; automatic history paging stops after about ten pages.
