# Layoff Panel — Scroll Behavior by Situation

Source: `js/main.js` · `renderLayoffPanel` → `timeListeners` callback (lines 1410–1437)

---

## How cards become visible

Each time the global time `t` changes, every `.layoff-card` is evaluated:

```
inRange = cardDate >= rangeStartTime && cardDate <= t
```

Cards that enter or leave `inRange` flip their `visible` CSS class.  
`firstVisible` = the earliest in-range card; `lastVisible` = the latest.  
Scroll only fires when **at least one card changed** (`anyChange === true`).

---

## Scroll rules per situation

| Situation | Condition | Scroll target | `scrollIntoView` args |
|-----------|-----------|---------------|-----------------------|
| **Compare mode — end line moves** | `compareMode && t changed` | `lastVisible` | `{ block: "end" }` — bottom of card aligns to bottom of panel |
| **Compare mode — start line moves** | `compareMode && rangeStartTime changed` | `firstVisible` | `{ block: "start" }` — top of card aligns to top of panel |
| **Cursor mode (non-compare)** | `!compareMode` | `lastVisible` | `{ block: "end" }` — same as end-line case |

All scrolls use `behavior: "smooth"`.

---

## Why this way

- **End line → scroll to last**: as the cursor moves forward in time, new cards appear at the bottom of the chronological list. Scrolling `lastVisible` to `block:"end"` keeps the newest card just in view without jumping past it.
- **Start line → scroll to first**: dragging the brush start backward reveals earlier cards at the top. Scrolling `firstVisible` to `block:"start"` anchors the panel to the earliest visible event.
- **Cursor mode always uses `lastVisible`**: there is no independent start cursor, so the panel simply follows the time cursor forward and keeps the most-recently-revealed card visible at the bottom.

---

## State variables

| Variable | Tracks |
|----------|--------|
| `prevPanelT` | previous value of `t` — detects end-cursor movement |
| `prevPanelStart` | previous value of `rangeStartTime` — detects start-cursor movement |
| `compareMode` | `true` when a brush selection is active on the stock chart |
| `rangeStartTime` | left edge of the selected range (or `TIME_START` in cursor mode) |
