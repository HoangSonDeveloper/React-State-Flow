import { Handle, Position } from '@xyflow/react'

interface Props {
  data: {
    label: string
    file: string
    renderCount: number
    isRecentlyRendered: boolean
  }
}

export function ContextNode({ data }: Props) {
  const { label, file, renderCount, isRecentlyRendered } = data

  return (
    <div
      style={{
        background: isRecentlyRendered ? '#1e1b40' : '#13111f',
        border: `1.5px solid ${isRecentlyRendered ? '#818cf8' : '#3730a3'}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 150,
        fontFamily: 'monospace',
        transition: 'border-color 0.2s, background 0.2s',
        boxShadow: isRecentlyRendered ? '0 0 12px #818cf844' : '0 2px 8px #00000044',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#4b5563' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 9, background: '#4338ca', color: '#c7d2fe', padding: '1px 5px', borderRadius: 4 }}>
          CONTEXT
        </span>
        <span style={{ color: '#c7d2fe', fontWeight: 700, fontSize: 13 }}>{label}</span>
      </div>

      <div style={{ color: '#64748b', fontSize: 10 }}>{file}</div>

      {renderCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            background: isRecentlyRendered ? '#818cf8' : '#334155',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 999,
            padding: '1px 6px',
            minWidth: 20,
            textAlign: 'center',
          }}
        >
          {renderCount}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: '#4b5563' }} />
    </div>
  )
}
