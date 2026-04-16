import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  status: TaskStatus
}

interface TasksState {
  items: Task[]
}

const initialState: TasksState = {
  items: [
    { id: 't1', title: 'Design landing page', status: 'todo' },
    { id: 't2', title: 'Wire up auth flow', status: 'todo' },
    { id: 't3', title: 'Write parser detector for Jotai', status: 'doing' },
    { id: 't4', title: 'Refactor graph layout', status: 'doing' },
    { id: 't5', title: 'Publish v0.1.0', status: 'done' },
    { id: 't6', title: 'Set up CI', status: 'done' },
  ],
}

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    addTask: (state, action: PayloadAction<{ title: string }>) => {
      state.items.push({
        id: `t${Date.now()}`,
        title: action.payload.title,
        status: 'todo',
      })
    },
    moveTask: (state, action: PayloadAction<{ id: string; status: TaskStatus }>) => {
      const task = state.items.find((t) => t.id === action.payload.id)
      if (task) task.status = action.payload.status
    },
    deleteTask: (state, action: PayloadAction<{ id: string }>) => {
      state.items = state.items.filter((t) => t.id !== action.payload.id)
    },
    renameTask: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const task = state.items.find((t) => t.id === action.payload.id)
      if (task) task.title = action.payload.title
    },
  },
})

export const { addTask, moveTask, deleteTask, renameTask } = tasksSlice.actions
export default tasksSlice.reducer
