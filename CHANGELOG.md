# Changelog

All notable changes to `react-state-flow` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-04-16

### Added
- Multi-store Redux support — each `configureStore` / `createStore` declaration
  now appears as its own node named after the variable. Components using
  `useSelector` / `useDispatch` are connected to every known Redux store when
  the consumed store can't be resolved unambiguously.
- Re-layout stability — saving a source file no longer reshuffles the graph
  when the topology (set of nodes + edges) is unchanged; positions and the
  user's pan/zoom are preserved.
- Parser AST cache — `parseProject` now parses each source file once and
  reuses the AST across both passes, roughly halving cold parse time on
  larger projects.
- Community files — `CHANGELOG.md`, `CONTRIBUTING.md`, GitHub issue and PR
  templates.

### Fixed
- Tightened component-name detection — `SCREAMING_SNAKE_CASE` constants
  (`MAX_RETRIES`, `API_URL`, …) are no longer mistaken for components.

### Changed
- **Behavior change:** Redux store node IDs now reflect the variable name
  declared in source (`const appStore = configureStore(...)` → node `appStore`)
  instead of always `ReduxStore`. The legacy `ReduxStore` id is still used
  as a fallback when no `configureStore`/`createStore` declaration is found
  in the scanned tree, so consumers whose store lives outside the scan
  continue to work. Programmatic consumers of `/api/graph` that hardcoded
  the id `ReduxStore` should switch to filtering by `node.storeLibrary === 'redux'`.

## [0.2.0] — 2026-04

### Added
- **High-leverage launch features (M1):** click-to-open in editor (VS Code,
  Cursor, WebStorm, Zed via `--editor`), search/filter UI with `⌘K`, and
  wasted-render detection (orange flash + cumulative count).
- **CLI flags (M2.1):** `--port`, `--no-open`, `--ignore`, `--editor`.
- **Pause / global reset (M2.3):** header controls to freeze render tracking
  or clear all counters across UI, server history, and runtime.
- **Class component support (M2.4):** detects classes extending
  `React.Component` / `PureComponent` (with `state` / `this.state` and
  `static contextType`), including their JSX children.
- README screenshots, `Why not React DevTools?` table, and `Supported state
  managers` section.

## [0.1.1] — 2026-03

### Fixed
- **Zustand cross-file detection:** `useXxxStore()` calls in components are
  now resolved when the `create()` declaration lives in a different file,
  via a shared store registry passed across parser passes.

## [0.1.0] — 2026-03

### Added
- Initial release: static analysis (`useState`, `useReducer`, Context,
  Redux, Zustand), runtime instrumentation via React DevTools hook,
  WebSocket bridge, interactive `@xyflow/react` graph with Dagre layout,
  live render counts, 800ms render flash, history replay across browser
  refreshes.

[Unreleased]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/HoangSonDeveloper/React-State-Flow/releases/tag/v0.1.0
