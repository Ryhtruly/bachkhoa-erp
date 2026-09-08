import { User } from 'lucide-react'

/** Card mô tả công việc, kèm người phụ trách như bản thiết kế node detail (Hình 2). */
export default function EiwTaskDescription({
  description,
  assignee,
  assigneeRole,
  emptyMessage = 'Bước này chưa có mô tả công việc.',
}) {
  return (
    <section className="eiw-desc" id="card-task-description" aria-label="Mô tả nhiệm vụ">
      <h3>Mô tả nhiệm vụ</h3>
      <p>{description || emptyMessage}</p>
      <div className="eiw-desc__assignee">
        <User size={15} />
        <span>Người phụ trách:</span>
        <strong>{assignee || 'Chưa phân công'}</strong>
        {assigneeRole && <em>({assigneeRole})</em>}
      </div>
    </section>
  )
}

