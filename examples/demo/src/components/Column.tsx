import type { Task, TaskStatus } from '../store/redux/tasksSlice'
import { TaskCard } from './TaskCard'

const TITLES: Record<TaskStatus, string> = {
  todo: 'To Do',
  doing: 'In Progress',
  done: 'Done',
}

export function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  return (
    <section className={`column column--${status}`}>
      <h3>
        {TITLES[status]} <span className="count">{tasks.length}</span>
      </h3>
      <div className="column-body">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && <p className="empty">No tasks</p>}
      </div>
    </section>
  )
}
