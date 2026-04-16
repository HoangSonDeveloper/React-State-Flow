import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  showContexts: boolean
  onToggleContexts: () => void
  showStores: boolean
  onToggleStores: () => void
}

export function SearchBar({ value, onChange, showContexts, onToggleContexts, showStores, onToggleStores }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce is handled in parent via derived state — keep SearchBar simple
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onChange])

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    border: `1px solid ${active ? '#818cf8' : '#2e3348'}`,
    background: active ? '#1e2040' : 'transparent',
    color: active ? '#c7d2fe' : '#64748b',
    cursor: 'pointer',
    fontFamily: 'monospace',
    userSelect: 'none',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filter components… (⌘K)"
          style={{
            background: '#13151f',
            border: '1px solid #2e3348',
            borderRadius: 6,
            color: '#e2e8f0',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '4px 28px 4px 8px',
            outline: 'none',
            width: 220,
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#818cf8' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#2e3348' }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <button style={chipStyle(showContexts)} onClick={onToggleContexts}>
        context
      </button>
      <button style={chipStyle(showStores)} onClick={onToggleStores}>
        store
      </button>
    </div>
  )
}
