# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kinmap is a single-page genogram (family tree) editor. It draws family
trees with an auto-balancing generational layout, lets users manage
partner unions (marriage, divorce, etc.) and emotional-tie relationships
(close, conflict, cutoff, etc.) between members, and persists genograms
to `localStorage`.

## Running it

There is no build step, package manager, or test suite — this is plain
HTML/CSS/JS with no dependencies. To work on it, just open `index.html`
directly in a browser (or serve the directory with any static file
server). Changes to `.js`/`.css` files take effect on page reload.

## Architecture

Four scripts are loaded as plain `<script>` tags (no modules, no
bundler) in a fixed order from `index.html`: `data.js` → `storage.js` →
`engine.js` → `app.js`. Each file is an IIFE that exposes one global,
and they talk to each other through those globals rather than imports:

- **`data.js`** — `FAM` (the data model: `people`, `unions`, `rels`
  arrays plus lookup helpers like `byId`, `parentsUnion`,
  `partnerUnions`) is the single source of truth, mutated directly
  (no reducer/immutability pattern). Also defines `REL_TYPES` — the
  two separate relationship vocabularies: `REL_TYPES.partner` (union
  types: marriage, divorce, widowed, etc., stored on `FAM.unions`) and
  `REL_TYPES.emotional` (tie types: close, conflict, cutoff, etc.,
  stored on `FAM.rels`) — and `SYM`, which renders all SVG symbols:
  person shapes, mini icons for the member list, relationship-line
  legend previews, and the actual emotional-tie curve renderer
  (`SYM.emotional`, a quadratic-bezier path builder used by
  `engine.js`'s `View.emotional()`).
- **`storage.js`** — `Storage`: all `localStorage` persistence
  (autosave, named saves, load, delete, JSON export). `App` calls
  `Storage.autosave()` after every mutation.
- **`engine.js`** — `Layout` (the auto-balancing generational layout
  algorithm: seeds descendant/ancestor positions, then iteratively
  relaxes to center parent couples over their children and de-overlap
  each generation row) and `View` (SVG rendering). `Layout.compute()`
  rebuilds the global mutable `POS` map (`id -> {x,y}`) on every
  render; `View` reads `POS` to draw. `View.canvas()` does a full
  re-render, replacing `#world`'s `innerHTML` with three layered `<g>`
  groups in this order: `layer-struct` (union/child lines), then
  `layer-nodes` (member symbols), then `layer-emo` (emotional ties)
  — `layer-emo` paints last so ties are always visible on top, and is
  `pointer-events:none` so it never steals node clicks. Emotional ties
  are anchored at each node's top-left/top-right corner (whichever
  faces the other person, via `cornerAnchor`), always bow upward
  (`relBow`), and bow further if another member's symbol sits near the
  straight path between the two endpoints.
- **`app.js`** — `App`: central `state` object, all event wiring, and
  the right-side drawer. The drawer is single-mode (`'add'` | `'edit'`
  | `'inspect'`), built by `addForm()` / `editForm()` / `inspectView()`
  returning HTML strings, with clicks handled through delegated
  `data-act="..."` attributes rather than per-element listeners.
  Mutation functions (`commitAdd`, `commitEdit`, `deletePerson`,
  `applyRel`, union edits) all follow the same pattern: mutate `FAM`
  directly, call `rerender()` (which calls both `View.canvas()` and
  `View.list()`), then `Storage.autosave()`.

## Conventions

The existing code is deliberately dense/minified-looking (arrow
functions, short variable names, template-literal HTML generation, few
line breaks). Match this style when editing rather than expanding it
out, so diffs stay small and consistent with the surrounding code.
