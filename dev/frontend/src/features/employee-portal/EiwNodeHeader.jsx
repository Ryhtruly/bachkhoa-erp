import { NODE_STATE_LABEL, PAUSE_LABEL } from './nodeLabels'

/**
 * Tầng 2-trái: tên bước đầy đủ (mã + tên).
 *
 * Dùng khi bước có task chi tiết — hiển thị nodeId, tên và trạng thái hiện
 * tại của bước đang mở.
 */
export default function EiwNodeHeader({ task }) {
  return (
    <h2 className="eiw-band eiw-band--name">
      {task.node_code}: {task.name}
    </h2>
  )
}

/**
 * Dải trạng thái / banner Ô Nghiệp Vụ phía trên cột phải (Hình 2).
 */
export function EiwStatusBand({ task, paused, extraCount }) {
  return (
    <div className="eiw-band eiw-band--task" id="checklist-top-bar">
      <span className="eiw-band__tag">Ô NGHIỆP VỤ</span>
      <span className="eiw-band__label">Nhiệm vụ</span>
      {task?.name && <h2 className="eiw-band__task-name">{task.name}</h2>}
      {extraCount && <span className="eiw-band__count">{extraCount}</span>}
      <span className={`eiw-state is-${task.status}`}>
        {paused
          ? PAUSE_LABEL[task.pause_reason_type] || 'Đang tạm dừng'
          : NODE_STATE_LABEL[task.status] || task.status}
      </span>
    </div>
  )
}


