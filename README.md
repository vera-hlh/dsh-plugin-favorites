# DSH Favorites

Bookmark a reply, a whole turn, selected text, or a file inside a DeepSeek Harness session — tag it, note why it matters, and jump back to the exact spot later.

Sessions get long, and the one answer you needed disappears under a hundred tool calls. Favorites keeps those spots in one panel, grouped by workspace, searchable by tag, type, session, or text.

## What you get

- **Four scopes** — one reply, prompt + reply, a text selection, or a file.
- **One panel** in the left sidebar: workspace grouping, tag chips, type filters, session filter, full-text search.
- **Jump back** — clicking a favorite opens its session, scrolls to the bookmarked text and highlights it in amber.
- **Notes and tags** on every entry, with an existing-tag picker so tags stay consistent.
- **Local only** — bookmarks live in the profile's data folder; nothing is uploaded.
- **Available to the agent** as the `favorites` tool (`list` / `add` / `remove`), so a session can save something for you on request.

## Where to find it

| Entry point | Label |
|---|---|
| Under any assistant reply | Bookmark icon in the message action row |
| After selecting text | Floating **Add to favorites** pill |
| Left sidebar | **Favorites** |
| Favorites panel toolbar | **Add file** |

The bookmark icon has three states: outlined (not saved), filled at 45% (the reply belongs to a saved turn), filled (saved).

## Scopes

| Scope | Saves | Jump lands on |
|---|---|---|
| Reply | the reply text | its first line |
| Turn | prompt + reply | the turn's prompt |
| Selection | the exact text you selected | that text, highlighted |
| File | a file path (optional line range) and the message it came from | the message, so you can open the file link yourself |

## Jumping back

A jump searches the transcript for the saved text, scrolls so it sits near the top of the transcript area, and highlights it with an amber overlay for a few seconds.

- The alignment keeps correcting itself for a while, so opening the transcript, paging history, or resizing the window still lands on the target.
- Any deliberate gesture (scroll, click, touch, key) stops the correction and clears the highlight immediately.
- Very old messages that are outside the loaded window are paged in automatically before the jump.

## Files

Besides transcript bookmarks, the panel can hold file bookmarks: a path with an optional line range, grouped in the same workspace view, with in-panel preview and path copy. The agent can create these too.

## Install

The package is a DSH bundle: no dependencies, no install scripts, nothing to build.

**From npm, with the `dsh` CLI** (Node.js ≥ 24.9):

```powershell
npx @deepseek-ai/dsh@0.2.2-rc.5 plugin --profile desktop add dsh-plugin-favorites
```

Replace `desktop` with your profile name. The command installs the package into that profile; restart DSH once so the client bundle loads.

**From a local checkout** (useful for development):

```powershell
git clone https://github.com/vera-hlh/dsh-plugin-favorites.git
```

Then open **Plugins** in DSH, add the cloned folder as a plugin, enable it, and restart once. A linked folder applies source edits on the next reload.

The plugin needs DSH with the Web client (`@deepseek-ai/dsh-client-ui-conversation`, `-sidebar`, `-layout`); it registers into the conversation action row, the sidebar, and the overlay layer.

## Data and privacy

- Bookmarks are stored as JSON at `<DSH_HOME>/profiles/<profile>/data/favorites.json`, with `favorites.backup.json` written before each save.
- The browser keeps a mirror in `localStorage` and merges it with the file on load.
- Everything stays on this machine: the plugin makes no network requests, and bookmarks never enter any model context by themselves.
- Because the store is per profile, switching profiles means a different set of bookmarks.

## Limitations

- Turn bookmarks created before 1.0.0 stored no prompt text, so their jump may land on the reply instead of the prompt. Re-create them to fix it.
- A jump can only reach messages the transcript can load; paging history stops after about ten pages.
- Each entry accepts up to 8 tags, 40 characters each.
- The jump identifies the target by its rendered text, so an excerpt that was heavily reformatted (for example split across many inline styles) may fall back to a coarser alignment.

## Disable or uninstall

Disabling the bundle removes the buttons, the pill, the panel, and the agent tool. The JSON file stays on disk, so re-enabling brings every bookmark back.

## Development

| File | Role |
|---|---|
| `index.js` | Host half: HTTP routes over the profile data file, the `favorites` agent tool |
| `client.js` | Web half: slot registrations, panel, dialogs, jump and highlight |
| `cordis.patch.yml` | Bundle patch that inserts the plugin row |
| `locale/*.json` | Display metadata used by Plugin Manager |
| `docs/` | Detail document and its feature image |

Reload after changing the Host half by toggling the plugin in Plugins; the client half needs an app restart (or a client plugin rebuild).

## License

MIT
