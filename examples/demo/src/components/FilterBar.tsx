import { useState } from 'react'
import { useUiStore } from '../store/zustand/useUiStore'

export function FilterBar() {
  const [localQuery, setLocalQuery] = useState('')
  const setFilter = useUiStore((s) => s.setFilter)

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalQuery(e.target.value)
    setFilter(e.target.value)
  }

  return (
    <div className="filter-bar">
      <label>Filter</label>
      <input
        type="text"
        value={localQuery}
        onChange={onChange}
        placeholder="Search tasks…"
      />
    </div>
  )
}
