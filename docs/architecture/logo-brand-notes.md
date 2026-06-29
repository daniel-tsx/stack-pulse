# Logo & brand identity — "Beat Stack"

**Status:** current
**Last updated:** 2026-06-29

The StackPulse mark, wordmark, animation, and icon system. Read this before touching any
logo/icon asset so the family stays coherent.

---

## Chosen direction

**"Beat Stack" — the PulseLoader frozen into a logo.**

Five lime release *beats* rise off a faint horizontal *feed line* in one asymmetric heartbeat
envelope (peak ratios **0.55 / 0.85 / 1 / 0.7 / 0.45** — lifted verbatim from
[`PulseLoader`](../../src/components/ui/pulse-loader.tsx)). The tallest, centre beat is topped by a
**separated lime dot** — the flagged / breaking release being caught — that floats clear of the bar
with a ~1px gap so it reads as a beacon, not a fat cap. That dot deliberately rhymes with the
wordmark's signature lime full stop: `stack`<span style="color:#a3e635">`.`</span>`pulse`.

### Why it fits StackPulse

- **It *is* the product, not a metaphor for it.** The bars are a frozen frame of the app's own
  loader (same `BAR_COUNT = 5`, same `PEAKS`, same 0.11s stagger). Ownable by construction — copying
  it means copying StackPulse's loader, not a stock equalizer (which is symmetric and uncapped; ours
  is asymmetric and capped by the live beat).
- **Triple-encodes the product:** stacked release events (stack / feed / "every release"), one
  left-to-right heartbeat (pulse / monitoring / alive), and the flagged beat (catch the breaking
  change). The feed line is the timeline every release lands on.
- **On-palette and on-voice:** lime `#a3e635` on near-black, terminal-precise, grid-aligned, no
  gradients — the house "technical, precise, alive" tone.
- **Survives 16px.** Separated vertical strokes are the geometry that downscales best (no tight
  zigzag valleys to mush — the exact failure of the old EKG-chevron mark).

### Alternatives explored

Five directions were developed as real SVG and judged across four lenses (brand-fit,
distinctiveness/premium, 16px legibility, animation-fit):

| Direction | Idea | Why not |
|-----------|------|---------|
| **Beat Stack** ✅ | PulseLoader frozen into bars + flagged beat | **Winner** — only mark intact at true 16px; maximally on-brand; animation-native |
| Distill | Live ringed node on a feed rail + distilled spike | Gorgeous large, collapses to a generic blob-with-tail at 16px |
| caret/beat | One stroke: prompt → heartbeat → cursor | Heartbeat mushes beside the chevron at 16px; leans on the commodity `>` |
| Signal S | Bespoke S monogram with two lime beat-nodes | Renders as a flat "5" at 16px; pulse metaphor told, not shown |
| Scope Break | Broken monitoring ring + beat | Reads as a figure-in-a-circle; skews wellness/medical |

---

## Animation concept

**"First heartbeat, then it lives."** Reuses existing house motion verbatim — no new easings.

- **On mount (one-shot):** the five beats rise from the feed line via `transform: scaleY(0→1)`,
  `transform-origin` at the baseline, staggered 0 / 0.08 / 0.16 / 0.24 / 0.32s (the PulseLoader
  cadence). When the centre beat lands, the flagged dot fires **one** ping — a concentric circle
  `scale(1→2.4)` + `opacity(0.5→0)`, the hero's live dot fired once instead of looping.
- **Idle (standalone SVGs only):** the flagged dot does a whisper-subtle `opacity 1→0.82` breath
  (3s). The React component does **not** loop — navbar stays perfectly calm.

### Why it's lightweight & appropriate

- Pure `transform` + `opacity` — GPU-composited, no layout, no repaint, no filters/blur.
- A micro-interaction, not a motion graphic. No spin, bounce, neon, or spinner cadence (the
  PulseLoader already owns "loading").
- **The static mark is complete without it** — motion only confirms life.
- **Reduced motion:** every animated asset carries
  `@media (prefers-reduced-motion: reduce)` that snaps to the finished static state (beats up, no
  ping/breath). In the React component this is wired through the existing `globals.css`
  reduced-motion block.

---

## Files

### React (source of truth for in-app usage)

- [`src/components/logo.tsx`](../../src/components/logo.tsx) — `<Logo size showWordmark animated />`.
  `animated` gates the reveal; honours reduced motion. Mark geometry + the `stack.pulse` wordmark.
- [`src/app/globals.css`](../../src/app/globals.css) — `@keyframes logo-rise` / `logo-ping`,
  the `.logo-mark-bar` / `.logo-ping` / `.logo-animated` classes, and the reduced-motion fallback.

### Brand SVGs — `public/brand/`

| File | What | Motion |
|------|------|--------|
| `logo.svg` | Full horizontal lockup (mark + wordmark), dark surfaces | static |
| `logo-animated.svg` | Full lockup with reveal | animated |
| `logo-light.svg` | Full lockup for light surfaces (dark squircle kept) | static |
| `logo-mark.svg` | Symbol only, bordered squircle | static |
| `logo-mark-animated.svg` | Symbol only, with reveal + idle breath | animated |
| `logo-mono.svg` | Single-ink symbol (`currentColor`), transparent | static |
| `app-icon.svg` | Master glyph on a full-bleed squircle, safe-area inset | static |
| `favicon-16x16.png`, `favicon-32x32.png` | Favicon-tier PNG exports | static |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | App / PWA icon exports | static |
| `preview.html` | Brand showcase across navbar, tabs, sidebar, dark/light | — |

### Wired into the app (static, regenerated by the script)

- [`src/app/icon.svg`](../../src/app/icon.svg) — favicon-tier master (void fill, no baseline, bolder
  strokes, separated beacon). Drives Next's `/icon` and the `.ico`.
- `src/app/favicon.ico` + `public/favicon.ico` — 16/32/48/64 from `icon.svg`.
- `src/app/apple-icon.png` (180) + `public/logo.png` (512, OG) — from `app-icon.svg`.
- [`src/app/manifest.ts`](../../src/app/manifest.ts) — PWA manifest → `/brand/icon-192|512.png`.
- [`src/app/opengraph-image.tsx`](../../src/app/opengraph-image.tsx) and
  [`stacks/[slug]/opengraph-image.tsx`](../../src/app/stacks/[slug]/opengraph-image.tsx) — inline mark.

### Regeneration

```bash
pnpm icons   # node scripts/generate-icons.mjs
```

Reads `src/app/icon.svg` (favicon tier) and `public/brand/app-icon.svg` (app tier) and emits every
`.ico` / `.png`. **Edit the SVGs, not the binaries.** High render density is set so small sizes stay
crisp. If you change the mark geometry, update `logo.tsx`, the OG inline marks, and the brand SVGs to
match, then run `pnpm icons`.

---

## Usage

| Use animated | Use static |
|--------------|------------|
| Landing header | Favicon, browser tab, app icons, OG images |
| Sign-in / welcome screen | Footer, dashboard/app headers, dense UI |
| Brand previews | Repeated instances, mobile, anywhere calm matters |

Currently animated in-app: the **landing header** and the **sign-in** screen. Everything else uses
the static `<Logo />`. Never animate the favicon.

### Colour & background

- **Primary:** lime `#a3e635` on void `#08080a` / shade `#0d0d10` — the signature pairing.
- **Light surfaces:** keep the dark squircle (`logo-light.svg`) so the lime-on-dark mark is
  preserved; wordmark goes near-black with a deep-lime (`#65a30d`) full stop for contrast.
- **Monochrome / print:** `logo-mono.svg` (one ink via `currentColor`, feed line at ~30%).
- The mark's lime dot and the wordmark's lime full stop must stay the **same hue** — one repeated
  "beat" carried from symbol into name.

### Clear space & sizes

- Clear space ≈ one bar-pitch (5px on the 32 grid) on all sides.
- Navbar 22px, inline/footer 18px, favicon 16px — all verified legible.

---

## Future ideas

- A reveal that fires once per session (not per route mount) for the persistent app header, if it's
  ever promoted to animated.
- An `<AnimatedLogo>` wrapper that replays on a custom trigger (e.g. when a new release lands in the
  feed) — the ping is already the "just caught one" gesture.
- A favicon-tier `favicon.svg` served directly for browsers that prefer SVG tab icons.
