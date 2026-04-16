import { Handle, Position } from '@xyflow/react'

interface Props {
  data: {
    label: string
    file: string
    line?: number
    stateSlots: string[]
    isContextProvider: boolean
    renderCount: number
    isRecentlyRendered: boolean
    wastedCount: number
    isRecentlyWasted: boolean
  }
}

export function ComponentNode({ data }: Props) {
  const { label, file, stateSlots, isContextProvider, renderCount, isRecentlyRendered, wastedCount, isRecentlyWasted } = data

  const flashColor = isRecentlyWasted ? '#f97316' : isRecentlyRendered ? '#22c55e' : null
  const borderColor = flashColor ?? (isContextProvider ? '#818cf8' : '#2e3348')
  const bgColor = isRecentlyWasted ? '#2d1a0a' : isRecentlyRendered ? '#1e3a2f' : '#1a1d27'
  const glowColor = isRecentlyWasted ? '#f9731644' : isRecentlyRendered ? '#22c55e44' : null

  return (
    <div
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 160,
        fontFamily: 'monospace',
        transition: 'border-color 0.2s, background 0.2s',
        boxShadow: glowColor ? `0 0 12px ${glowColor}` : '0 2px 8px #00000044',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#4b5563' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {isContextProvider && (
          <span style={{ fontSize: 9, background: '#4338ca', color: '#c7d2fe', padding: '1px 5px', borderRadius: 4 }}>
            CTX
          </span>
        )}
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>{label}</span>
      </div>

      {/* File path */}
      <div style={{ color: '#64748b', fontSize: 10, marginBottom: stateSlots.length > 0 ? 6 : 0 }}>
        {file}
      </div>

      {/* State slots */}
      {stateSlots.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {stateSlots.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 10,
                background: '#172554',
                color: '#93c5fd',
                padding: '1px 6px',
                borderRadius: 4,
                border: '1px solid #1e3a8a',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Render count badge */}
      {renderCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            background: isRecentlyWasted ? '#f97316' : isRecentlyRendered ? '#22c55e' : '#334155',
            color: isRecentlyWasted || isRecentlyRendered ? '#fff' : '#94a3b8',
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 999,
            padding: '1px 6px',
            minWidth: 20,
            textAlign: 'center',
            transition: 'background 0.2s',
          }}
        >
          {renderCount}
        </div>
      )}

      {/* Wasted render badge */}
      {wastedCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            background: '#f97316',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            borderRadius: 999,
            padding: '1px 5px',
            minWidth: 18,
            textAlign: 'center',
            title: 'Wasted renders',
          }}
        >
          ⚠ {wastedCount}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: '#4b5563' }} />
    </div>
  )
}
