# Changelog

All notable changes to `react-state-flow` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.2] — 2026-04-17

### Fixed
- Runtime no longer inflates render counts for bailed-out components. The
  commit walker now only emits an event when the fiber actually rendered
  (new mount or a change in `memoizedProps` / `memoizedState` /
  `dependencies` / `updateQueue` / `ref` vs. its alternate), eliminating
  false-positive wasted-render flags on untouched subtrees.
- CLI `--port` value is now injected into the served UI as
  `window.__RSF_PORT__`, so the browser bridge connects to the correct
  WebSocket when the server runs on a non-default port.

### Added
- Detector coverage for aliased and namespaced imports:
  - Context: `React.createContext` / `React.useContext` via `import * as React`
    and aliased named imports from `react`.
  - Redux: aliased `useSelector` / `useDispatch` / `configureStore` / `createStore`,
    namespace imports (`import * as redux from 'redux'`), typed wrappers
    (`useSelector.withTypes<RootState>()`), and cross-file custom hook
    re-exports — including arrow-wrapped forms like
    `export const useAppSelector = (s) => useSelector(s)`.
  - Zustand: aliased `create` imports and the curried generic form
    `create<State>()(...)`.

## [0.4.0] — 2026-04-17

### Added
- Stable file/symbol-backed node IDs (`type:filepath#symbol`) — components with
  the same name declared in different files now appear as separate nodes, and
  runtime render events map to the exact source location.
- Import-aware cross-file resolver with tsconfig path-alias support
  (`@components/*`, barrel `export *`, default exports, namespace member JSX).
- Optional Vite plugin (`react-state-flow/vite`) that injects
  `registerComponent()` calls so the runtime can emit exact component IDs even
  when component names are ambiguous. Anonymous `export default function() {}`
  forms are rewritten transparently.
- New subpath exports: `react-state-flow/runtime/register` (manual registration
  API) and `react-state-flow/runtime/history` (shared history snapshot helper).
- Wasted-render counts are now persisted in the server history buffer and
  replayed to refreshed UI clients.
- SSR-safe runtime bootstrap — `import 'react-state-flow/runtime'` is a no-op
  under Node / SSR evaluation.

### Changed
- **Behavior change:** `/api/graph` node IDs switched from plain labels
  (`Button`) to `type:filepath#symbol` (`component:src/Button.tsx#Button`).
  Programmatic consumers that hardcoded label-based IDs must update their
  lookups.
- `vite` is declared as an optional `peerDependency` (required only when using
  the new plugin).
- tsconfig parsing now delegates to `jsonc-parser` for comment / trailing-comma
  tolerance instead of an ad-hoc regex sanitizer.

### Fixed
- Duplicate component names across files are no longer collapsed into a single
  node.
- Runtime render events now carry a `componentId`, so the UI can map renders to
  the correct file when multiple components share a label.
- Circular re-export chains no longer poison the export resolver cache with
  negative results.
- Parser first pass runs in metadata-only mode, avoiding the previous
  double edge-detection cost on every file.

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

[Unreleased]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.4.0...v0.4.2
[0.4.0]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/HoangSonDeveloper/React-State-Flow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/HoangSonDeveloper/React-State-Flow/releases/tag/v0.1.0
