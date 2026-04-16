import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ComponentNode } from './nodes/ComponentNode.js'
import { ContextNode } from './nodes/ContextNode.js'
import type { GraphData, RuntimeState } from './types.js'
import { useRuntimeBridge } from './useRuntimeBridge.js'
import { applyDagreLayout } from './layout.js'

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
      stateSlots: n.stateSlots,
      isContextProvider: n.isContextProvider,
      renderCount: runtime.renderCounts[n.id] ?? 0,
      isRecentlyRendered: runtime.recentlyRendered.has(n.id),
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
  const [runtime, setRuntime] = useState<RuntimeState>({
    renderCounts: {},
    recentlyRendered: new Set(),
  })

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // D5: Capture ReactFlow instance for imperative fitView
  const rfInstanceRef = useRef<any>(null)

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
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

  // D1 Effect 1: Rebuild layout only when the static graph changes
  useEffect(() => {
    if (!graph) return
    const emptyRuntime: RuntimeState = { renderCounts: {}, recentlyRendered: new Set() }
    const rawNodes = buildFlowNodes(graph, emptyRuntime)
    const rawEdges = buildFlowEdges(graph)
    const laidOut = applyDagreLayout(rawNodes, rawEdges)
    setNodes(laidOut)
    setEdges(rawEdges)
    // D5: fitView after layout using requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      rfInstanceRef.current?.fitView({ padding: 0.15, duration: 400 })
    })
  }, [graph, setNodes, setEdges])

  // D1 Effect 2: Update render counts/highlights without recomputing layout
  useEffect(() => {
    if (!graph) return
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          renderCount: runtime.renderCounts[n.id] ?? 0,
          isRecentlyRendered: runtime.recentlyRendered.has(n.id),
        },
      })),
    )
  }, [runtime, graph, setNodes])

  // Runtime bridge
  const handleRuntimeUpdate = useCallback((state: RuntimeState) => {
    setRuntime(state)
  }, [])

  // D2: graph-update from file watcher
  const handleGraphUpdate = useCallback((newGraph: GraphData) => {
    setGraph(newGraph)
  }, [])

  useRuntimeBridge(handleRuntimeUpdate, handleGraphUpdate)

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

  if (!graph) {
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
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
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
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onInit={(instance) => { rfInstanceRef.current = instance }}
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
