# Gated Memory Policy website spec

Single page research paper site. Plain HTML, CSS, JS. No build step.

## Quick start

```bash
cd /Users/jinyun/Documents/mem_website
python3 -m http.server 8080
# visit http://localhost:8080
```

## File map

```text
mem_website/
  index.html            all page content
  style.css             all visual styling
  main.js               tab switching, video preload, section reveal, TOC,
                        custom video controls, method-image lightbox, BibTeX
  website_spec.md       this file
  scripts/              python generators (plot_success_rate.py, plot_robomimic.py,
                        make_in_the_wild_grid.py)
  paper/                dated paper PDFs (latest one is linked from the "Paper"
                        button and from every fn-ref)
  assets/
    favicon.png
    images/
      teaser/           markovian.svg, in-trial.svg, cross-trial.svg (Fig. 1)
      team/             headshots (jpg)
      architecture.svg  method row 1 figure
      gating_training.svg method row 2 figure
      hf-logo.svg       Hugging Face logo
      arxiv-logomark.svg arXiv logo
      pos_overlay.png   initial cup position overlay
    charts/             SVG bar charts (output of scripts/plot_*.py)
    videos/             teaser + cross_trial/ + in_trial/ + attention_vis_*.mp4
```

## Design system

All tokens live in `style.css` under `:root`. Changing them propagates site wide.

### Palette (warm cream, academic press feel)

| Token           | Value                     | Role                                       |
| --------------- | ------------------------- | ------------------------------------------ |
| `--bg`          | `#faf7f0`                 | main page background                       |
| `--bg-alt`      | `#f2ece0`                 | footer background                          |
| `--surface`     | `#fdfbf6`                 | elevated card surface                      |
| `--surface-hi`  | `#fffefa`                 | hover surface                              |
| `--text`        | `#1a1612`                 | body and heading text                      |
| `--text-soft`   | `#3a3328`                 | secondary text                             |
| `--text-muted`  | `#78695a`                 | captions, eyebrows, inactive tab labels    |
| `--text-faint`  | `#b2a390`                 | pub-meta timestamp, very low emphasis      |
| `--accent`      | `#b5552a`                 | active tab, link, corresponding author †   |
| `--accent-rgb`  | `181, 85, 42`             | rgba() form of accent                      |
| `--accent-soft` | `rgba(181, 85, 42, 0.09)` | subtle accent tint                         |
| `--accent-line` | `rgba(181, 85, 42, 0.28)` | accent-tinted rule                         |
| `--border`      | `rgba(60, 45, 25, 0.13)`  | default divider                            |
| `--border-hi`   | `rgba(60, 45, 25, 0.22)`  | stronger divider (buttons, FAQ hairline)   |
| `--hairline`    | `rgba(60, 45, 25, 0.06)`  | faint rule, inline code background         |
| `--shadow-xs/sm/md/lg` |                    | layered shadow ladder                      |

### Motion tokens

- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` — used by every fade/slide.
- `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)` — reserved for symmetric transitions.

### Spacing scale

```css
--space-xs:   8px
--space-sm:   16px
--space-md:   24px
--space-lg:   48px
--space-xl:   80px
--space-2xl: 128px
```

One ladder used throughout so section / subsection / row gaps nest cleanly instead of drifting.

### Typography

- Body and UI: `Inter` via Google Fonts (weights 300-800).
- Accent / code: `JetBrains Mono` (tab numerics, pub-meta timestamp, video time readout).
- OpenType features enabled: `ss01`, `cv11`, `cv05`, `kern`, `liga`, `calt`.
- Headings use the same Inter stack, tighter line height.
- Body base size: `17px`, line height `1.7`.

Heading scale:

| Element | Size                           | Weight | Notes                               |
| ------- | ------------------------------ | ------ | ----------------------------------- |
| `h1`    | `clamp(2.8rem, 6.8vw, 4.8rem)` | 800    | paper title only                    |
| `h2`    | `clamp(1.55rem, 2.6vw, 1.9rem)`| 700    | section titles, accent underline    |
| `h3`    | `1.4rem`                       | 650    | unified subsection heading          |
| `h4`    | `1.05rem`                      | 600    | rarely used                         |

Prose typography (applied to `.body-text`, `#abstract p`, `.subsection-intro`, `.tf-descriptions p`, `.benchmark-caption`, `.faq-answer p`, `figcaption`):

- `text-align: justify; text-align-last: left` for a clean right edge.
- `text-wrap: pretty` to let the browser globally pick better line ends.
- `hyphens: auto` gated by `hyphenate-limit-chars: 10 4 4` — only words ≥10 chars hyphenate, minimum 4 chars on each side of the break. Hyphenation is therefore rare but kicks in when the ragged edge would look too jagged.

### Emphasis convention

Three tiers, used consistently across the page:

| Tier      | Usage                                                       | Markup                         |
| --------- | ----------------------------------------------------------- | ------------------------------ |
| highlight | Single hero takeaway per section (≤1). Accent wash behind.  | `<span class="highlight">`     |
| bold      | Important concepts, factual details, numeric callouts.      | `<strong>`                     |
| italic    | Task names, paper titles, software names, defined terms.    | `<em>`                         |

### Layout

- Unified content column: `--max-w: 848px` with `--pad-x: 24px` → content width `800px`.
  Used by `.container`, every `<section>`, `#abstract`, etc.
- Abstract matches section **content** width (`calc(var(--max-w) - var(--pad-x) * 2)` = 800px) so abstract prose and task / method / FAQ prose align to the same measure.
- `.teaser-figure` is the one element that extrudes beyond the column, up to `1080px` via `margin-left: 50%; transform: translateX(-50%)`.
- `.full-bleed` (In-the-Wild banner) spans `100vw` via negative margins.

### Section padding (major sections)

| Section         | Desktop top/bottom       | Mobile (≤ 768px) |
| --------------- | ------------------------ | ---------------- |
| default         | `52px / 52px`            | `36px / 36px`    |
| `#in-the-wild`  | `32px / 48px` (`!important`) | `20px / 32px` |

All major sections (`#cross-trial`, `#in-trial`, `#in-the-wild`, `#method`, `#attention`, `#benchmark`, `#faq`, `#team`, `#acknowledgments`) now share one vertical rhythm of ~104px between any two. In-the-Wild is the deliberate exception because its full-bleed grid needs to fit in one viewport.

### Motion

- Scrolling uses the browser default. No snap, no hijacking.
- Each top-level section slides up 90px and fades in over 0.9s when it enters the viewport (threshold `0.04`). `prefers-reduced-motion` disables it.
- Tab underline slides in via `transform: scaleX`.
- Link hover shows an underline that grows from left to right.

## Page structure

### Hero (`#hero-title`, not a `<section>`)

Flex-centered column, `min-height: 100vh`, `padding: 96px var(--pad-x) 40px`.

```text
Title (h1 "Gated Memory Policy")
Authors (4, with "†" on corresponding)
Institution (Stanford University)
.pub-meta  ("Published {date} · Updated {date}" — mono, faint, uppercase)
.link-buttons  (Paper PDF, arXiv (logomark), Code, Model, Dataset)
#abstract (folded into hero)
  ├── <p> (first abstract paragraph, justified)
  ├── .teaser-figure (Fig. 1, extrudes beyond column)
  │   ├── .tf-headers  (3 columns: (a) No Memory / (b) In-Trial / (c) Cross-Trial)
  │   ├── .tf-photos   (3 columns: markovian.svg, in-trial.svg, cross-trial.svg)
  │   ├── .tf-descriptions (3 columns: Tool Hang, Continuous Place Back, Iterative Casting)
  │   └── <figcaption> (single caption spanning full width)
  └── <p> (remaining abstract paragraphs)
```

Teaser figure internals:

- All three rows use `display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px`.
- `.tf-photos { align-items: end }` — photos bottom-align so their baselines line up.
- `.tf-photos img` at `height: 150px` by default; first two (markovian, in-trial) bumped to `175px` so the narrower 1:1 / 1.13:1 SVGs visually balance the wider 1.65:1 cross-trial SVG.
- Headers center-aligned, descriptions left-aligned with `.tf-descriptions { align-items: start }` so the footnote superscript on paragraph 1 doesn't push its baseline down.

### Section inventory

| id               | Title                     | Notes                                                        |
| ---------------- | ------------------------- | ------------------------------------------------------------ |
| `#hero-title`    | Hero card                 | Title, authors, institution, pub-meta, buttons, abstract+teaser |
| `#cross-trial`   | Cross-Trial Memory Tasks  | `.section-label: "MemMimic Benchmark"`, Pushing / Casting / Flinging |
| `#in-trial`      | In-Trial Memory Tasks     | `.section-label: "MemMimic Benchmark"`, Place Back (Real) / Match Color / Discrete Place Back |
| `#in-the-wild`   | In-the-Wild Results       | Full-bleed 40-trial grid; 20 clean + 20 with human perturbation |
| `#method`        | Method                    | Intro paragraph + zigzag method-row pair, SVGs click-to-zoom |
| `#attention`     | What Is the Policy Attending To? | Cube Pushing / Match Color tab pair                    |
| `#benchmark`     | Benchmark Performance     | RoboMimic + MIKASA-Robo stacked blocks                       |
| `#faq`           | Questions & Answers       | `<details>` accordion                                        |
| `#team`          | Team                      | Author grid (4 cards, linked except J. Liu)                  |
| `#acknowledgments` | Acknowledgments         | (Renamed from "Thanks"; uses blog's condensed 3-paragraph copy) |
| `.cta-block`     | Soft CTA pair             | "Questions about the work?" / "Problems with the codebase?"  |
| `#footer`        | Footer                    | Citation, BibTeX, copyright                                  |

## HTML contracts used by JS

### Tab system

```html
<div class="tab-bar" role="tablist" data-tabgroup="GROUP">
  <button class="tab-btn active" data-tab="VALUE" role="tab">Label</button>
  <button class="tab-btn"        data-tab="VALUE2" role="tab">Label 2</button>
</div>

<div class="tab-panel active" data-tabgroup="GROUP" data-config="VALUE">...</div>
<div class="tab-panel" data-tabgroup="GROUP" data-config="VALUE2">...</div>
```

`data-tab` must match exactly one panel's `data-config` in the same `data-tabgroup`.

Tab groups in use:

| tabgroup          | Section                                | Axis                  | tabs |
| ----------------- | -------------------------------------- | --------------------- | ---- |
| `pushing`         | Cross-Trial Pushing                    | friction coefficient  | 6    |
| `casting`         | Cross-Trial Casting                    | friction regime       | 2    |
| `flinging`        | Cross-Trial Flinging                   | cloth mass            | 7    |
| `place-back-real` | In-Trial Continuous Place Back (Real)  | object location       | 5    |
| `match-color`     | In-Trial Match Color                   | target location       | 4    |
| `place-back`      | In-Trial Discrete Place Back (Sim)     | object location       | 4    |
| `attn-vis`        | Attention Visualization                | task                  | 2    |

### Videos

- Comparison clips: `<video autoplay loop muted playsinline preload="none">`, no native `controls`.
- In-the-Wild banner: `<video class="full-bleed" ... preload="auto">` — preload hot so the restart-from-frame-0 loop doesn't re-buffer.
- FAQ long-memory clips: keep native `controls` so the reader can scrub.
- Custom video control overlay wraps every `<video>` in `.vid-host` on boot (see JS section 7).
- No cropping: each video renders at its source clip's native aspect ratio (no `object-fit: cover`, no forced aspect-ratio box).

### Footnote references

```html
<a class="fn-ref"
   href="paper/Gated_Memory_Policy_2026-04-22.pdf"
   target="_blank" rel="noopener"
   data-fn="Paper · Finding 2, Figs. 4c, 8c">5</a>
```

- Anchor content is the visible superscript number.
- `data-fn` is rendered into a hover tooltip via `::after`.
- `.fn-ref` uses `display: inline-block; vertical-align: super; line-height: 0` so it doesn't expand surrounding line boxes.
- Hyphens and encoded HTML entities (`&middot;`, `&sect;`, `&ndash;`) are safe inside `data-fn`.

Current footnotes:

| # | Anchor                  | Location                                                |
| - | ----------------------- | ------------------------------------------------------- |
| 1 | Robomimic arXiv         | Abstract, Tool Hang teaser, RoboMimic benchmark caption |
| 2 | MIKASA-Robo site        | MIKASA-Robo benchmark caption                           |
| 3 | MemoryVLA arXiv         | MIKASA-Robo benchmark caption                           |
| 4 | Paper §III.A/B          | Method intro paragraph                                  |
| 5 | Paper Finding 2, Fig. 4c/8c | Attention section intro                             |
| 6 | Paper Tasks T4–T6, Figs. 8–10 | Cross-trial section intro                         |
| 7 | Paper Tasks T1–T3, Figs. 4–6  | In-trial section intro                            |
| 8 | Paper Finding 5, Fig. 14 | Method Architecture caption (linear-cost claim)        |

### Sticky TOC with MemMimic sublinks

```html
<nav id="toc-nav">
  <div class="toc-inner">
    <p class="toc-title">On This Page</p>
    <a class="toc-link" href="#abstract">Overview</a>
    <a class="toc-link toc-parent" href="#cross-trial">MemMimic</a>
    <a class="toc-link toc-sublink" href="#cross-trial">Cross-Trial Tasks</a>
    <a class="toc-link toc-sublink" href="#in-trial">In-Trial Tasks</a>
    <a class="toc-link" href="#in-the-wild">In-the-Wild</a>
    <a class="toc-link" href="#method">Method</a>
    <a class="toc-link" href="#attention">Causal Attention</a>
    <a class="toc-link" href="#benchmark">Other Benchmarks</a>
    <a class="toc-link" href="#faq">FAQ</a>
    <a class="toc-link" href="#team">Team</a>
  </div>
</nav>
```

- `.toc-parent` ("MemMimic") stays highlighted whenever **either** `#cross-trial` or `#in-trial` is the active section.
- `.toc-sublink.active` gets a thin accent underline (distinct from the parent's accent dot).
- TOC becomes visible after the first content section enters view; hidden at the footer and while any full-bleed section is on screen.

### BibTeX copy

```html
<pre><code id="bibtex-content">...</code></pre>
<button class="copy-btn" onclick="copyBibtex(this)">Copy BibTeX</button>
```

## JS architecture (`main.js`)

Eight independent blocks.

### 1. Tab switching

Generic handler attached per `.tab-bar`. On click it removes `.active` from sibling buttons/panels in the same tabgroup, activates the clicked one, and resumes any autoplay videos inside the newly shown panel via `guardedVideoLoad()` (see below).

### 2. `guardedVideoLoad(video)` helper

Calls `video.load()` only when it's safe:

- Returns `false` and skips the reload if `video.dataset.scrubbing === '1'` (user is dragging the custom progress bar).
- Returns `false` and skips if metadata is already present (`readyState > 0 || duration > 0`).

`video.load()` otherwise resets `currentTime`, which breaks custom scrubbing and re-buffers a playing clip.

### 3. Video preload + playback (three layers)

Goal: user never sees a buffering spinner; Chrome's decoder pool is never flooded.

- **Intent layer.** Videos sorted in DOM order; a frontier advances so that `AHEAD=15` videos ahead of the near viewport edge are queued. Visibility and tab clicks promote videos to the front of the queue.
- **Prefetch layer.** FIFO queue drained during browser idle time (`requestIdleCallback` with 1500ms timeout fallback). Concurrency capped at `MAX_INFLIGHT=4`; `canplay` / `loadeddata` free a slot. `fetchPriority` is `high` for hot-start videos within 1.2× the viewport height at boot. If `dataset.scrubbing === '1'` the pump requeues rather than re-loading.
- **Playback layer.** `IntersectionObserver` at `threshold: 0.25`. Plays when visible, pauses on exit. Two data flags coordinate with the custom controls:
  - `data-user-paused="1"` — user clicked our pause button; skip auto-play on re-entry.
  - `data-scrubbing="1"` — user is dragging our progress bar; skip auto-pause.

`<details>` children open their autoplay clips proactively via `enqueue(v, true)`.

Save-Data and 2G connections downshift to `AHEAD=2, MAX_INFLIGHT=2`.

### 4. Section slide-in

One `IntersectionObserver` watches every major section. All sections receive `.section-reveal` on boot (translateY 90px + opacity 0), then `.is-visible` is added when the section crosses the viewport (`threshold: 0.04`). 0.9s cubic-bezier slide. Fires once per section. Disabled under `prefers-reduced-motion`.

### 5. Sticky TOC nav

- Scroll listener (passive) + resize listener control `.visible` on `#toc-nav` based on "past hero" and "not in footer / over a full-bleed section".
- `IntersectionObserver` with `rootMargin: '-15% 0 -75% 0'` picks the active section.
- Links are grouped by target href so multiple links pointing to the same section all highlight together; MemMimic parent gets `.active` whenever either sublink's section is in view.

### 6. BibTeX copy

Clipboard API with an `execCommand` fallback. Button shows "Copied!" for 2 seconds.

### 7. Custom video controls

Wraps every `<video>` in a fresh `.vid-host` on boot and injects:

- `.vid-track::before` — thin hairline at the bottom of the video (1.5px idle → 3px on hover).
- `.vid-fill` — accent-colored played portion.
- `.vid-knob` — scrubber dot (only visible on hover, grows upward from the hairline; `transform-origin: center bottom`).
- `.vid-range` — transparent native `<input type="range">` on top for pointer capture.
- `.vid-time` — monospace `current / total` readout in the **top-right** corner.
- `.vid-pill` — glass-morphism pill (bottom-right) with play/pause, playback-speed (0.5× / 1× / 1.5× / 2×), fullscreen. Hover-only.

Visibility rules:

- Default (non full-bleed): hairline + fill + `.vid-time` **always visible**. Muted bottom shade (`.vid-controls::after`, 20px tall, 22% → 0% black) keeps them legible on bright frames; fades out on hover.
- `.vid-host-bleed` (In-the-Wild banner): every overlay stays hover-only; the shade is `display: none`.
- Knob and pill stay hover-only across all videos.

Coordination flags on the `<video>` element (`data-user-paused`, `data-scrubbing`) are respected by section 3's IntersectionObservers so auto-play / auto-pause never fights the user.

### 8. Method image lightbox

Every `.method-img img` gets `cursor: zoom-in`. Click opens a fixed overlay (`z-index: 200`) with:

- Dim backdrop (`rgba(20, 16, 12, 0.88)` + backdrop-filter blur 8px).
- Image scaled via `width: min(94vw, 1800px); height: auto; max-height: 94vh` — forces up-scaling past the SVG's baked-in `width="376"` attribute.
- 320ms cubic-bezier opacity + transform animation (scale 0.88 → 1.0). Image preload before animate, double-`requestAnimationFrame` so the transition fires cleanly.
- Closes on backdrop click, × button, or Esc.

## Component CSS map

| Selector             | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `.section-label`     | Mono uppercase eyebrow above an h2 (e.g., "MemMimic Benchmark") |
| `.link-buttons`      | Flex row of pill buttons in hero                             |
| `.btn-link`          | Hero pill button (Paper / arXiv / Code / Model / Dataset)    |
| `.arxiv-logo`        | arXiv logomark inside arXiv button                           |
| `.hf-logo`           | HF logo inside Model / Dataset buttons                       |
| `.pub-meta`          | Published / Updated timestamp block                          |
| `.tab-bar / .tab-btn / .tab-panel` | Tab system                                     |
| `.video-grid.three-col` | 3-column comparison grid                                  |
| `.col-header`        | Mono uppercase label above each video column                 |
| `.col-header.ours`   | Accent-colored variant for "Ours" column                     |
| `.task-header` + `.task-chart` | Side-by-side subsection header with success-rate chart |
| `.subsection-intro`  | Short paragraph under a subsection h3                        |
| `.overlay-details`   | Accent-text `<details>` toggle (used by "Show Initial Cup Position Distribution"). Chevron rotates on open. |
| `.wild-labels` + `.wild-label` | Two half-width titles above the In-the-Wild grid (Without / With Human Perturbation) |
| `.full-bleed`        | 100vw escape hatch                                           |
| `.method-row` + `.method-row-flip` + `.method-img` + `.method-caption` | Zigzag method blocks |
| `.method-steps`      | Numbered procedure list inside `.method-caption`             |
| `.fn-ref`            | Footnote superscript + hover tooltip                         |
| `.benchmark-block` + `.benchmark-chart` + `.benchmark-caption` | Stacked benchmark results |
| `.faq-list` + `.faq-item` + `.faq-answer` + `.faq-video` | FAQ accordion            |
| `.team-grid` + `.author-card` + `.author-photo` | Team section                    |
| `.cta-block` + `.cta-item` + `.cta-question` + `.cta-action` + `.cta-arrow` + `.cta-divider` | Soft CTA pair before the footer |
| `.highlight`         | Accent-wash behind a key phrase                              |
| `.math-gray / .math-blue` | Inline math notation colors                             |
| `.teaser-figure` + `.tf-headers` + `.tf-photos` + `.tf-descriptions` + `.tf-header` + `.tf-title-row` + `.tf-letter` + `.tf-title` + `.tf-sub` | Fig. 1 composite |
| `.vid-host / .vid-controls / .vid-track / .vid-fill / .vid-knob / .vid-range / .vid-time / .vid-pill / .vid-btn` | Custom video overlay |
| `.img-lightbox` + `.img-lightbox-close` | Method-SVG zoom overlay                   |

## Maintenance how-tos

### Update the paper PDF

1. Drop the new dated PDF under `paper/`.
2. Update the `href` on the Paper button and on every `fn-ref` in `index.html` (grep for the old filename).
3. If new findings are introduced, update the `data-fn` tooltip text on the relevant `fn-ref` anchors.

### Update the publish / updated dates

Edit `#hero-title .pub-meta` in `index.html`. Keep `datetime` attributes in ISO (`YYYY-MM-DD`) form for accessibility.

### Add a new tab within a subsection

1. Drop the three mp4 files under `assets/videos/.../[new_config]/`.
2. Add a new `<button class="tab-btn" data-tab="new_config">` to the tab bar.
3. Add a new `<div class="tab-panel" data-tabgroup="X" data-config="new_config">` with the video grid.

### Add a new footnote

1. Insert `<a class="fn-ref" href="..." data-fn="...">N</a>` after the claim.
2. Use `&middot;` for bullets, `&sect;` for section marks, and `&ndash;` for en-dashes inside `data-fn`.
3. Keep numbering roughly in reading order across the page.

### Change the accent color

Edit `--accent`, `--accent-rgb`, `--accent-soft`, `--accent-line` under `:root`. Tabs, links, author marker, highlight wash, fn-ref, progress fill, focus ring, overlay-details chevron, CTA arrows all update together. Rerun chart generators (`scripts/plot_*.py`) so chart SVGs match.

### Regenerate charts

```bash
cd /Users/jinyun/Documents/mem_website/scripts
python plot_success_rate.py      # per-task success-rate bars + mikasa benchmark
python plot_robomimic.py         # robomimic grouped bar chart
python make_in_the_wild_grid.py  # 8x5 grid of 40 outdoor trials
```

Each script uses the site palette tokens defined at the top of the file.

### Hide / add a top-level section

1. Wrap in `<!-- -->` or add `<section id="...">` with the desired id.
2. Add / remove its `.toc-link` in `#toc-nav`.
3. If a new section needs the MemMimic parent/sublink treatment, add `.toc-parent` / `.toc-sublink` classes and update the `MEM_CHILDREN` map in `main.js` section 5.

### Adjust the teaser figure photo heights

`style.css`, `.tf-photos img { height: 150px; }` + `.tf-photos img:nth-child(1), :nth-child(2) { height: 175px; }`. The taller nth-child rule exists so the narrower markovian (1:1) and in-trial (1.13:1) panels visually balance the wider cross-trial (1.65:1) panel.

### Force a video to always show (or always hide) the progress bar

- Default: hairline + fill + time visible, shade active, knob + pill hover-only.
- Opt-out (hover-only everything): add `.full-bleed` to the `<video>` — the JS will wrap it in `.vid-host-bleed` and the CSS restores hover-only behavior.
- To make a specific video keep native controls instead of the overlay, either use `<video controls>` — the overlay JS removes `controls` by default — or set `data-custom-controls="1"` manually before boot so the wrapper skips attachment.
