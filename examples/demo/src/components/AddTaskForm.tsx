import { useReducer } from 'react'
import { useDispatch } from 'react-redux'
import { addTask } from '../store/redux/tasksSlice'
import type { AppDispatch } from '../store/redux/store'

interface FormState {
  title: string
  error: string
}

type FormAction =
  | { type: 'set-title'; title: string }
  | { type: 'set-error'; error: string }
  | { type: 'reset' }

const initialForm: FormState = { title: '', error: '' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'set-title':
      return { ...state, title: action.title, error: '' }
    case 'set-error':
      return { ...state, error: action.error }
    case 'reset':
      return initialForm
  }
}

export function AddTaskForm() {
  const [formState, dispatchForm] = useReducer(formReducer, initialForm)
  const dispatch = useDispatch<AppDispatch>()

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formState.title.trim()) {
      dispatchForm({ type: 'set-error', error: 'Title required' })
      return
    }
    dispatch(addTask({ title: formState.title.trim() }))
    dispatchForm({ type: 'reset' })
  }

  return (
    <form className="add-task-form" onSubmit={onSubmit}>
      <label>New task</label>
      <input
        type="text"
        value={formState.title}
        onChange={(e) => dispatchForm({ type: 'set-title', title: e.target.value })}
        placeholder="What needs doing?"
      />
      {formState.error && <span className="error">{formState.error}</span>}
      <button type="submit">Add</button>
    </form>
  )
}
