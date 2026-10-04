---
name: clone-website
description: Clone a web page so it looks exactly the same — either an offline pixel-faithful mirror of a site the user owns, or a from-scratch rebuild that matches another site's layout, spacing, type and interactions using the user's own brand and content. Use when the user says "clone this website", "make my site look exactly like <url>", "copy this layout/design", "recreate this page", "mirror/archive this page", or gives a URL as a design reference for their own site.
---

# Clone a website (exactly)

Two scripts do the mechanical work; you do the judgement. Both live in `scripts/` next to this file
and only need Node + Playwright (preinstalled in cloud sessions; otherwise `npm i -D playwright`).

| Script | What it does |
|---|---|
| `capture.mjs <url> [--out dir]` | Loads the page in Chromium, scrolls to trigger lazy content, freezes the **rendered** DOM (incl. CSS-in-JS rules, chosen `srcset` images, canvases), downloads every stylesheet/image/font/media, rewrites all URLs to local paths, strips scripts/trackers, and saves full-page desktop + mobile screenshots. |
| `compare.mjs <reference> <clone>` | Screenshots both (URL, folder, .html or .png), writes `reference.png`, `clone.png`, `diff.png` and prints % mismatch plus the worst horizontal bands. |

Run them with `node .claude/skills/clone-website/scripts/<script>.mjs …`
(if `playwright` isn't resolvable, prefix `NODE_PATH=$(npm root -g)`).

## Step 0 — pick the mode (ask if unclear)

**A. Exact mirror** — the user owns the site / has the rights (migrating off a builder like Wix,
Webflow or WordPress, archiving, making an offline copy). Copy everything as is.

**B. Reference rebuild** — the URL is *someone else's* site and the user wants the same look for
**their** brand ("make my site like X"). Match layout, grid, spacing, type scale, colour feel,
card anatomy, hover/scroll behaviour **exactly**, but:
- never ship the other site's logo, photos, illustrations, copy, project data, or trademarks;
  use the user's content, or clearly marked placeholders (`/* REPLACE: … */`, neutral images);
- don't make it passable *as* the other company (different name, logo, colours where the brand
  colour is distinctive, footer/legal details, contact info);
- keep forms posting to the user's endpoint (or `#`), never to the original.

Never build a copy meant to impersonate a real business or collect someone's logins/payments; decline that.

## Mode A — exact mirror

1. `node scripts/capture.mjs https://example.com/page --out site/page`
   - Add `--keep-scripts` only if the page needs JS to work (menus, sliders). Default is a static
     snapshot, which is usually *more* faithful because frameworks often break when re-hydrated offline.
   - `--wait 4000` for slow animations; `--width/--height` to change the desktop viewport.
2. Open `manifest.json` → `failed`; refetch or replace anything important that didn't download.
3. `node scripts/compare.mjs https://example.com/page site/page --out site/page/.diff`
4. Look at `diff.png`. Typical leftovers and fixes:
   - Missing font → a `@font-face` URL failed; download it and fix the path in the CSS.
   - Lazy image blank → set `src` from the `data-*` attribute the site uses.
   - Animated/carousel area differs → it's mid-animation; ignore or freeze to its first frame.
   - Cookie banner / chat widget → remove the element.
5. Repeat 3-4 until mismatch is < ~1-2 % (the rest is usually animation and font anti-aliasing).
   Repeat per page (`--out site/about`, …) and fix cross-page links if mirroring several pages.

## Mode B — reference rebuild (same look, user's content)

1. **Capture the reference for study only** (keep it out of the deliverable, e.g. in the scratchpad):
   `node scripts/capture.mjs <url> --out <scratch>/ref`. Read the screenshots with the Read tool
   and skim `ref/index.html` + its CSS for the real values.
2. **Extract the design system** into CSS custom properties before writing any markup:
   container width and gutters, grid columns/gaps, section paddings, font families + weights +
   sizes/line-heights/letter-spacing per level, colours (bg, surface, text, muted, accent, borders),
   radius, shadows, button styles, image aspect ratios, transition timings, breakpoints.
   Pull exact numbers from the captured CSS / computed styles, not by eye. Use the same *kind* of
   typeface (free Google Fonts equivalent if theirs is licensed).
3. **Rebuild section by section**, top to bottom, with semantic HTML and clean CSS (no copied
   class soup): header/nav → hero → filters → grid/cards → CTA → footer. Put the user's brand
   name, logo text, copy and data in; placeholders where you don't have them.
4. **Recreate behaviour**: sticky/transparent header, filter tabs, hover states, reveal-on-scroll,
   mobile menu — small vanilla JS.
5. **Compare against the reference** with `compare.mjs <scratch>/ref/original-desktop.png site/`
   and at mobile width (`--width 390 --height 844` vs `original-mobile.png`). Because content
   differs, judge structure: section heights, column positions, spacing rhythm and the
   "worst band" list. Iterate until the page heights and band positions line up.
6. Tell the user exactly which placeholders remain (images, copy, contact details, RERA/legal ids).

## When the URL can't be fetched

Cloud sessions sit behind a network policy; if `capture.mjs` exits with a tunnel/connection
error the host is blocked. Tell the user the host name and that they can allow it under the
environment's Network access settings, or ask them for a saved page ("Save Page As → complete")
or full-page screenshots. Meanwhile build what you can from the description and refine once
the reference is available.

## Limits to mention when relevant
- Content behind login, paywalls or bot protection won't capture.
- Shadow-DOM web components and cross-origin iframes (maps, videos) aren't inlined; re-embed them.
- A static snapshot has no backend: forms, search and carts need re-wiring.
