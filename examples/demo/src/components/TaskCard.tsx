import { useContext, useState } from 'react'
import { useDispatch } from 'react-redux'
import { ThemeContext } from '../contexts/ThemeContext'
import { deleteTask, moveTask, renameTask } from '../store/redux/tasksSlice'
import type { Task, TaskStatus } from '../store/redux/tasksSlice'
import type { AppDispatch } from '../store/redux/store'

const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: 'doing',
  doing: 'done',
  done: null,
}

export function TaskCard({ task }: { task: Task }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(task.title)
  const { theme } = useContext(ThemeContext)
  const dispatch = useDispatch<AppDispatch>()

  const next = NEXT_STATUS[task.status]

  const onSave = () => {
    if (draftTitle.trim()) {
      dispatch(renameTask({ id: task.id, title: draftTitle.trim() }))
    }
    setIsEditing(false)
  }

  return (
    <div className={`task-card task-card--${theme}`}>
      {isEditing ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
      ) : (
        <span onDoubleClick={() => setIsEditing(true)}>{task.title}</span>
      )}
      <div className="task-actions">
        {next && (
          <button onClick={() => dispatch(moveTask({ id: task.id, status: next }))}>
            → {next}
          </button>
        )}
        <button className="danger" onClick={() => dispatch(deleteTask({ id: task.id }))}>
          ✕
        </button>
      </div>
    </div>
  )
}
