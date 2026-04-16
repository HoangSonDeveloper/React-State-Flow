# react-state-flow

Visualize React component state and re-render flow in real time.

Parses your React codebase into an interactive graph, then overlays live render data from your running app — so you can see which components re-render, how often, and how state flows through the tree.

## How it works

1. **Static analysis** — scans your source files and builds a component graph (components, contexts, parent-child relationships)
2. **Runtime instrumentation** — hooks into React DevTools to capture render events without modifying your components
3. **Live visualization** — renders an interactive graph in the browser, updated in real time as your app runs

## Installation

```bash
npm install react-state-flow
```

## Usage

### Step 1 — Add runtime instrumentation

Import at the very top of your `main.tsx` (before React mounts):

```ts
import 'react-state-flow/runtime'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

The runtime is automatically disabled in production (`NODE_ENV=production` or Vite's `MODE=production`), so this import is safe to commit.

### Step 2 — Run the CLI

```bash
npx react-state-flow ./src
```

The browser opens automatically at `http://localhost:7272` with your component graph. Start your app and the graph updates live as components render.

## CLI

```bash
react-state-flow [directory]
```

| Argument | Default | Description |
|---|---|---|
| `directory` | `.` | Path to your React source directory |

The CLI runs on port `7272`. Your app's Vite dev server can run on any other port.

## What the graph shows

- **Component nodes** — each React function component, with its `useState`/`useReducer` state slots listed
- **Context nodes** — each `createContext` call
- **Parent-child edges** — JSX render relationships between components
- **Context provision edges** — which component renders a `Context.Provider`
- **Context subscription edges** — which components call `useContext`
- **Render counts** — live badge on each node showing how many times it has rendered
- **Render flash** — green highlight for 800ms after a component re-renders

The graph updates automatically when you save source files (no restart needed).

## Requirements

- Node.js 18+
- React 16.8+ (hooks required for DevTools hook support)

## License

MIT
