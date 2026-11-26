# Highlight alignment: the final design

This note explains how "jump to a bookmark" decides *what* to scroll to and *what* to highlight. It replaces an earlier internal handoff note: the approach changed several times while the DOM behaviour was being measured, and this is the model that survived those measurements.

## Why this is not a one-liner

Jumping to saved text sounds like `find(text).scrollIntoView()`. Four properties of the transcript make that naive version fail:

1. **The text is split across nodes.** A stored excerpt comes from `textContent`, but the rendered DOM may cut the same sentence into `<strong>`, `<code>` and `<a>` children. A probe that expects one text node matches nothing.
2. **The text is not unique.** Conversation replies restate each other. A file name such as `source-defect-playbook.md` can appear in several turns, so "first match in the document" lands far away.
3. **Each turn can hold several assistant messages.** The action row (where the bookmark button lives) is rendered once per turn, at the end, so "the message this button belongs to" is not the same as "the reply the user is reading".
4. **Reasoning blocks come first.** A message with visible thinking renders that thinking before the reply body, and it is not content the user asked to bookmark.

## What Chat tells us

Chat marks every flow row in the transcript:

```
data-chat-flow-kind="user" | "assistant-step" | "turn-tail" | "tool-call" | …
data-chat-turn="12"
```

Those two attributes are the backbone of the current implementation. They are read through `[data-chat-flow-kind="…"][data-chat-turn="…"]`, and the answer row of the current message is found by climbing from the bookmark button to the nearest `[data-chat-turn]`.

Reasoning blocks, timestamps and the action row itself are excluded by `[data-disclosure-row]`, `[data-disclosure-header]`, `[data-disclosure-panel]`, `[data-clock]`, `[data-actions-reveal]` and `aria-hidden`.

## Per-scope resolution

| Scope | Target | How |
|---|---|---|
| Turn | that turn's prompt | the turn's `user` row, whole text (minus metadata) |
| Message | first paragraph of the turn's reply | the turn's first `assistant-step` row, first paragraph element, so a wrapped sentence is covered whole |
| Excerpt / file | the saved passage | cross-node text match inside the message region, then extended to the passage's last line |

The turn number is taken from the bookmark, then from the button's own `data-dshfav-turn`, then from the enclosing `data-chat-turn`. A scope only uses the deterministic path when a real turn number is available; otherwise it falls through to the heuristics below.

### The cross-node matcher

`findStreamRange()` joins every text node of the transcript into one string, remembering which node and offset produced each character. A probe is searched in that string, so a phrase broken by inline markup still matches as a whole. Both sides are normalized the same way (whitespace and `*` `_` `` ` `` `#` `>` removed) — normalizing only one side was an early bug: a literal `*` inside `/* … */` made an entire line unmatchable.

Search is restricted to the message's own region (previous message's row → this row) and, within that region, prefers the topmost occurrence.

### Fallback chain

1. Chat flow attributes (above).
2. Layout heuristics: the topmost text of the content column (`firstContentLine`), or the right-aligned prompt bubble (`firstPromptRange`).
3. The cross-node matcher.
4. Global nearest match.

Every step narrows the region first; a match outside the region is discarded rather than trusted.

## Rendering the highlight

The overlay lives in the plugin's own layer (`position: fixed`, `pointer-events: none`), so no host DOM is modified.

1. Take the range's client rects **per text node**, so the band hugs the glyphs instead of covering a block box (block rects produced full-width bands).
2. Merge those rects by **vertical overlap**, not by a quantized `top`: an inline `code` box is shorter and rides a pixel or two higher, and bucketing by `top` split one visual line into two bands with different heights — the "uneven, stepped" highlight reported earlier.
3. Emit **one band per visual line**, spanning `min(left) → max(right)`.

A short probe is extended to the end of its visual line (`extendToLineEnd`), and a multi-line passage is extended to its last line (`extendRangeToQuote`). Both use the same-line rule: same band, or continuing to the right of where the line started; a wrap returns to the left edge.

## Keeping the target in place

Alignment runs *before* painting each tick, so the overlay never lags the scroll. A jump keeps correcting for a few seconds, because the Chat shell restores its own reading position and history pages insert content above:

- `align()` adjusts the transcript's `scrollTop` directly (top inset of 120 px), never `scrollIntoView`'s `start`/`center` semantics;
- the correction loop watches for up to 20 s, re-resolving the anchor (a re-render may replace the button node);
- any deliberate gesture ends it — with an 800 ms grace period so the click that opened the session is not counted;
- after the fast window, one light `resize` watcher remains, so switching window sizes re-aligns without fighting the user.

When a bookmark points at a message too old to be mounted at all, history paging runs first (up to 25 s, with a single persistent progress notice), and a turn-based fallback aligns the view even if the action row never appears.

## Known limits

- A passage whose markdown differs from the rendered text by more than inline formatting (tables, code fences) may match only its first line.
- Bookmarks created before turn prompts were stored have no prompt text; they rely on the flow attributes and the heuristics above.
- The script heuristic used to skip reasoning prefers the writing system of the stored text; a reply that switches language mid-line may pick a later line.
