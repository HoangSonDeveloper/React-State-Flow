import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ComponentNode } from './nodes/ComponentNode.js'
import { ContextNode } from './nodes/ContextNode.js'
import type { GraphData, RuntimeState } from './types.js'
import { useRuntimeBridge } from './useRuntimeBridge.js'
import { applyDagreLayout } from './layout.js'
import { SearchBar } from './SearchBar.js'

const nodeTypes = {
  component: ComponentNode,
  context: ContextNode,
}

function buildFlowNodes(graph: GraphData, runtime: RuntimeState): Node[] {
  return graph.nodes.map((n, i) => ({
    id: n.id,
    type: n.type,
    position: { x: (i % 5) * 220, y: Math.floor(i / 5) * 160 },
    data: {
      label: n.label,
      file: n.file,
      line: n.line,
      stateSlots: n.stateSlots,
      isContextProvider: n.isContextProvider,
      renderCount: runtime.renderCounts[n.id] ?? 0,
      isRecentlyRendered: runtime.recentlyRendered.has(n.id),
      wastedCount: runtime.wastedCounts[n.id] ?? 0,
      isRecentlyWasted: runtime.recentlyWasted.has(n.id),
    },
  }))
}

function buildFlowEdges(graph: GraphData): Edge[] {
  return graph.edges.map((e) => {
    const isCtxSub = e.type === 'context-subscription'
    const isCtxProv = e.type === 'context-provision'
    const color = isCtxSub ? '#818cf8' : isCtxProv ? '#a78bfa' : '#334155'
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: isCtxSub || isCtxProv,
      style: {
        stroke: color,
        strokeWidth: isCtxSub || isCtxProv ? 2 : 1.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })
}

function FlowCanvas() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showContexts, setShowContexts] = useState(true)
  const [showStores, setShowStores] = useState(true)
  const [paused, setPaused] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeState>({
    renderCounts: {},
    recentlyRendered: new Set(),
    wastedCounts: {},
    recentlyWasted: new Set(),
  })

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // D5: Capture ReactFlow instance for imperative fitView
  const rfInstanceRef = useRef<any>(null)

  // M3.4: Topology signature of last layout. When the new signature matches we
  // keep existing node positions instead of triggering a full Dagre re-layout
  // (avoids nodes jumping around when a file save changes only data, not structure).
  const lastTopoSigRef = useRef<string>('')

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (!graph) return
      const gNode = graph.nodes.find((n) => n.id === node.id)
      if (!gNode) return

      const scheme: string = (window as any).__RSF_EDITOR_SCHEME__ ?? 'vscode://file/{path}:{line}'
      const absPath = `${graph.projectRoot}/${gNode.file}`
      const url = scheme
        .replace('{path}', encodeURIComponent(absPath).replace(/%2F/g, '/'))
        .replace('{line}', String(gNode.line ?? 1))

      window.open(url, '_self')
    },
    [graph],
  )

  // D4: Load static graph with retry backoff
  useEffect(() => {
    let cancelled = false
    let delay = 500

    function attempt(tries: number) {
      fetch('/api/graph')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data: GraphData) => {
          if (!cancelled) setGraph(data)
        })
        .catch(() => {
          if (cancelled) return
          if (tries >= 6) {
            setError('Could not reach CLI server after multiple retries')
            return
          }
          setTimeout(() => attempt(tries + 1), delay)
          delay = Math.min(delay * 2, 8000)
        })
    }

    attempt(0)
    return () => { cancelled = true }
  }, [])

  // Derived: apply search/filter before layout
  const filteredGraph = useMemo(() => {
    if (!graph) return null
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => {
        if (n.type === 'context' && !showContexts) return false
        if (n.type === 'store' && !showStores) return false
        if (searchQuery) return n.label.toLowerCase().includes(searchQuery.toLowerCase())
        return true
      }),
    }
  }, [graph, searchQuery, showContexts, showStores])

  // D1 Effect 1: Rebuild layout when graph topology or filter changes.
  // M3.4: When topology (node + edge id sets) is unchanged, keep existing node
  // positions and only refresh static data fields. fitView is suppressed in that
  // case so the user's pan/zoom isn't disturbed on every file save.
  useEffect(() => {
    if (!filteredGraph) return
    const emptyRuntime: RuntimeState = {
      renderCounts: {},
      recentlyRendered: new Set(),
      wastedCounts: {},
      recentlyWasted: new Set(),
    }
    const rawNodes = buildFlowNodes(filteredGraph, emptyRuntime)
    const nodeIds = new Set(filteredGraph.nodes.map((n) => n.id))
    const prunedGraph = { ...filteredGraph, edges: filteredGraph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)) }
    const rawEdges = buildFlowEdges(prunedGraph)

    const sortedNodeIds = [...nodeIds].sort().join(',')
    const sortedEdgeIds = prunedGraph.edges.map((e) => e.id).sort().join(',')
    const topoSig = `${sortedNodeIds}|${sortedEdgeIds}`
    const topologyUnchanged = topoSig === lastTopoSigRef.current

    if (topologyUnchanged) {
      // Merge new static data into existing positioned nodes.
      const dataById = new Map(rawNodes.map((n) => [n.id, n.data]))
      setNodes((prev) =>
        prev.map((n) => ({ ...n, data: { ...n.data, ...(dataById.get(n.id) ?? {}) } })),
      )
      setEdges(rawEdges)
      return
    }

    lastTopoSigRef.current = topoSig
    const laidOut = applyDagreLayout(rawNodes, rawEdges)
    setNodes(laidOut)
    setEdges(rawEdges)
    requestAnimationFrame(() => {
      rfInstanceRef.current?.fitView({ padding: 0.15, duration: 400 })
    })
  }, [filteredGraph, setNodes, setEdges])

  // D1 Effect 2: Update render counts/highlights without recomputing layout
  useEffect(() => {
    if (!filteredGraph) return
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          renderCount: runtime.renderCounts[n.id] ?? 0,
          isRecentlyRendered: runtime.recentlyRendered.has(n.id),
          wastedCount: runtime.wastedCounts[n.id] ?? 0,
          isRecentlyWasted: runtime.recentlyWasted.has(n.id),
        },
      })),
    )
  }, [runtime, filteredGraph, setNodes])

  // Runtime bridge
  const handleRuntimeUpdate = useCallback((state: RuntimeState) => {
    setRuntime(state)
  }, [])

  // D2: graph-update from file watcher
  const handleGraphUpdate = useCallback((newGraph: GraphData) => {
    setGraph(newGraph)
  }, [])

  const { reset: resetRuntime } = useRuntimeBridge(handleRuntimeUpdate, handleGraphUpdate, { paused })

  if (error) {
    return (
      <div style={{ color: '#f87171', fontFamily: 'monospace', padding: 32, background: '#0f1117', height: '100%' }}>
        <div style={{ fontSize: 16, marginBottom: 8 }}>Failed to load graph</div>
        <div style={{ color: '#64748b', fontSize: 13 }}>{error}</div>
        <div style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>
          Make sure the CLI server is running: <code>npx react-state-flow ./src</code>
        </div>
      </div>
    )
  }

  if (!graph || !filteredGraph) {
    return (
      <div style={{ color: '#64748b', fontFamily: 'monospace', padding: 32, background: '#0f1117', height: '100%' }}>
        Loading graph...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          zIndex: 10,
          background: '#0f1117',
          borderBottom: '1px solid #1e2235',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: 'monospace',
        }}
      >
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>React State Flow</span>
        <span style={{ color: '#334155', fontSize: 12 }}>|</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          {filteredGraph?.nodes.length ?? 0} / {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          showContexts={showContexts}
          onToggleContexts={() => setShowContexts((v) => !v)}
          showStores={showStores}
          onToggleStores={() => setShowStores((v) => !v)}
        />
        <button
          onClick={() => setPaused((v) => !v)}
          title={paused ? 'Resume render tracking' : 'Pause render tracking'}
          style={{
            fontSize: 11,
            padding: '3px 9px',
            borderRadius: 4,
            border: `1px solid ${paused ? '#f59e0b' : '#2e3348'}`,
            background: paused ? '#2a1f0e' : 'transparent',
            color: paused ? '#fcd34d' : '#94a3b8',
            cursor: 'pointer',
            fontFamily: 'monospace',
            userSelect: 'none',
            transition: 'all 0.15s',
          }}
        >
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        <button
          onClick={resetRuntime}
          title="Clear render counts (server + runtime + UI)"
          style={{
            fontSize: 11,
            padding: '3px 9px',
            borderRadius: 4,
            border: '1px solid #2e3348',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            fontFamily: 'monospace',
            userSelect: 'none',
            transition: 'all 0.15s',
          }}
        >
          ↺ Reset
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#64748b' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#334155', display: 'inline-block' }} />
            parent-child
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#818cf8', display: 'inline-block' }} />
            context sub
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#a78bfa', display: 'inline-block' }} />
            context provides
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#22c55e', display: 'inline-block' }} />
            re-render
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#f97316', display: 'inline-block' }} />
            wasted render
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={(instance) => { rfInstanceRef.current = instance }}
        nodesConnectable={false}
        edgesUpdatable={false}
        fitView
        fitViewOptions={{ padding: 0.15, minZoom: 0.2 }}
        style={{ background: '#0f1117', width: '100%', height: '100%' }}
      >
        <Background color="#1e2235" gap={24} />
        <Controls style={{ background: '#1a1d27', border: '1px solid #2e3348' }} />
        <MiniMap
          style={{ background: '#1a1d27', border: '1px solid #2e3348' }}
          nodeColor={(n) => (n.type === 'context' ? '#4338ca' : '#334155')}
        />
      </ReactFlow>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}
