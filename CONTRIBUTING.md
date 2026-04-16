# Contributing to react-state-flow

Thanks for your interest! This is a small, focused project — issues and PRs
that align with the goal (visualizing React state + render flow) are very
welcome.

## Getting started

```bash
git clone https://github.com/HoangSonDeveloper/React-State-Flow.git
cd React-State-Flow
npm install
npm run build
```

To run end-to-end against the bundled demo app:

```bash
# terminal 1 — demo React app
cd examples/demo
npm install
npm run dev

# terminal 2 — RSF CLI scanning the demo
cd ../..
npm run dev -- examples/demo/src
```

Then open http://localhost:7272.

## Scripts

```bash
npm run build       # TS (src/ → dist/) + UI (ui/ → ui/dist/)
npm run build:ts    # Compile TypeScript only
npm run build:ui    # Build the visualization UI only (Vite)
npm run dev         # Run the CLI server in dev (tsx src/index.ts)
npm run ui:dev      # Run the UI dev server (Vite)
npm test            # vitest run
npm run test:watch  # vitest watch
```

## Architecture overview

See [CLAUDE.md](CLAUDE.md) for the full architecture, but in short:

1. **`src/parser/`** — AST-based static analysis (Babel) that turns a React
   project into a `GraphData { projectRoot, nodes, edges }`.
2. **`src/runtime/`** — published as the `react-state-flow/runtime` subpath.
   Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__` and streams render events to
   the CLI server over WebSocket.
3. **`src/index.ts`** — CLI entry: Express + WebSocket broker on port 7272 +
   chokidar file watcher.
4. **`ui/`** — Vite app rendering the graph with `@xyflow/react`.

## Adding support for a new state manager (detector pattern)

Any new detection rule **must** be implemented as its own file in
[`src/parser/detectors/`](src/parser/detectors/) and registered in
`createDefaultDetectors()`. Do **not** add detection logic to
`parse-file.ts` — that file is a slim orchestrator.

Each detector implements the `Detector` interface
([`src/parser/detectors/types.ts`](src/parser/detectors/types.ts)) and may
opt into one or more phases:

| Phase | Hook | Use for |
|---|---|---|
| 1 | `detectDeclarations(ctx)` | Standalone nodes (contexts, stores) |
| 2 | `enrichComponent(component, ctx)` | Per-component features + edges (hooks, subscriptions) |
| 3 | `detectEdges(ctx)` | Edges that need the full component set (e.g. JSX parent-child) |

Reference detectors:
[context.detector.ts](src/parser/detectors/context.detector.ts),
[redux.detector.ts](src/parser/detectors/redux.detector.ts),
[zustand.detector.ts](src/parser/detectors/zustand.detector.ts),
[state-slots.detector.ts](src/parser/detectors/state-slots.detector.ts),
[jsx-children.detector.ts](src/parser/detectors/jsx-children.detector.ts).

## Tests

We use [vitest](https://vitest.dev). Add tests next to the file you change
(`*.test.ts`). The parser test suite
([`src/parser/parse-file.test.ts`](src/parser/parse-file.test.ts)) is the
canonical place for new detector behavior — copy an existing `describe`
block and adapt.

When refactoring: tests must stay green **before and after**. If a refactor
breaks tests, the refactor is wrong. Only update tests when the behavior
intentionally changed (and call that out in the commit message + CHANGELOG).

## PR checklist

- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] New behavior has a test
- [ ] User-visible changes added to `CHANGELOG.md` under `## [Unreleased]`
- [ ] Commit messages use [conventional commits](https://www.conventionalcommits.org/)
      (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)

## Project conventions

- Single npm package (not a monorepo) — `npm` only, no pnpm/yarn lockfiles.
- TypeScript strict mode. Keep public APIs stable.
- One file, one concern. Files exceeding ~200 lines that do multiple things
  should be split.

## Reporting issues

Please use the issue templates. A reproduction (smallest possible component
that triggers the problem) makes triage dramatically faster.
