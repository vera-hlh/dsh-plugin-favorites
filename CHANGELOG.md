# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-26

Jump precision and highlight rendering were reworked, and the four bookmark scopes now have a single, explicit meaning.

### Changed

- **Turn** bookmarks highlight that turn's prompt, located through Chat's own flow attributes (`data-chat-flow-kind="user"` + `data-chat-turn`) instead of layout heuristics or text matching.
- **Message** bookmarks highlight the first paragraph of the turn's reply (which may wrap), located through `data-chat-flow-kind="assistant-step"`.
- **Excerpt** and **file** bookmarks highlight the entire stored passage. Matching now works across text nodes, so a probe split by bold, inline code, or links still resolves to the whole passage.
- Jumping to a bookmark far outside the loaded window pages history for up to 25 seconds and reports progress in a single, persistent notice that clears once the target is reached; a turn-based fallback aligns the view even when the message's action row never mounts.

### Fixed

- Highlight bands no longer stack their opacity (one band per visual line), no longer stop at inline code (same-line detection by vertical overlap), and no longer offset from the text.
- Reasoning ("thinking") blocks, timestamps, and action rows are excluded from every text pick.
- The loading notice no longer flickers between messages while history pages.

### Removed

- Temporary diagnostics and the `/diagnostics` route used while fixing the alignment.

## [1.0.17] - 2026-11-26

### Fixed

- An excerpt whose opening line is short (a heading such as `归档执行`) started the highlight at the second line, because the start probe required at least six characters. A short opening line is now accepted when it matches exactly once inside the message, so the heading is included in the highlight.

## [1.0.16] - 2026-11-26

### Fixed

- Jump highlight alignment: `paintRangeRects` bucketed line fragments by a quantized `top` (`Math.round(top / 2) * 2`). An inline code span renders a shorter box whose top sits a pixel or two above the prose, so every English/code fragment landed in its own bucket and got a second amber band with a different top and height — the overlay looked stepped and uneven on exactly those tokens. Line membership is now decided by vertical overlap (half the smaller box), and each band spans that line's full ascent→descent, so consecutive lines match.

## [1.0.3] - 2026-11-24

### Fixed

- `client.js` registered its module under the pre-rename id (`@local/dsh-plugin-favorites`), so the Web half never matched the installed package: no bookmark buttons, no selection pill, no Favorites panel, while the Host half kept working. The module id is now `dsh-plugin-favorites`.

## [1.0.2] - 2026-11-24

### Fixed

- `cordis.patch.yml` still named the pre-rename package (`@local/dsh-plugin-favorites`), so an installation from the registry could not load the plugin row. The patch now names `dsh-plugin-favorites`.

## [1.0.1] - 2026-11-24

### Changed

- README (English and Chinese): replaced the descriptive install section with the verified `dsh plugin --profile <name> add dsh-plugin-favorites` command and the local-checkout path.

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
