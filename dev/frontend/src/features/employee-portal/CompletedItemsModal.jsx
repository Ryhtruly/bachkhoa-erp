import { useState } from 'react'
import { CheckCircle2, Clock, FileText, MapPin } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/** Bước đã nghiệm thu / đang chạy / chưa tới lượt — cùng ba sắc thái với thẻ Hạng mục. */
const STEP_TONE = {
  accepted: 'done',
  completed: 'done',
  in_progress: 'active',
  submitted: 'active',
  rework_required: 'rework',
}

const CHECKLIST_TONE = {
  approved: 'done',
  late_approved: 'done',
  rejected: 'rework',
}

const dayLabel = (value) => {
  if (!value) return null
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Lịch sử Hạng mục nhân viên đã làm xong phần của mình.
 *
 * Bố cục cố ý giống dãy bước bên tab Giám đốc: cả chuỗi K của Hạng mục, nhưng
 * bước của người đang xem được tô đậm — họ cần thấy phần mình nằm ở đâu trong
 * chuỗi, không phải một danh sách rời rạc chỉ có việc của mình.
 */
export default function CompletedItemsModal({ items = [], onClose }) {
  const [openId, setOpenId] = useState(items[0]?.workflow_instance_id || null)

  return <Modal open onClose={onClose} size="lg" id="ew-history" title="Lịch sử hạng mục đã hoàn thành">
    <ul className="ew-history">
      {items.map((item) => {
        const expanded = openId === item.workflow_instance_id
        const myNodes = (item.nodes || []).filter((node) => node.mine)

        return <li key={item.workflow_instance_id} className={`ew-history__item${expanded ? ' is-open' : ''}`}>
          <button
            type="button"
            className="ew-history__head"
            aria-expanded={expanded}
            onClick={() => setOpenId(expanded ? null : item.workflow_instance_id)}
          >
            <span className="ew-history__title">
              <strong>{item.service_line_name}</strong>
              <span>HĐ {item.contract_id} · KH: {item.customer_name}</span>
            </span>
            <span className="ew-history__meta">
              {item.location_label && <span><MapPin size={12} />{item.location_label}</span>}
              {item.last_accepted_at && <span><Clock size={12} />{dayLabel(item.last_accepted_at)}</span>}
            </span>
          </button>

          {/* Nói thẳng hạng mục đã đóng trọn vẹn hay mới xong phần của mình —
              nhân viên đo vẽ xong K03 không có nghĩa hồ sơ đã khép lại. */}
          <p className={`ew-history__state${item.workflow_done ? ' is-done' : ''}`}>
            <CheckCircle2 size={13} />
            {item.workflow_done
              ? `Hạng mục đã đóng trọn vẹn · bạn làm ${item.my_node_count} bước`
              : `Bạn xong phần của mình · hạng mục còn bước của phòng khác · bạn làm ${item.my_node_count} bước`}
          </p>

          <div className="ew-history__chain" aria-label="Chuỗi bước của hạng mục">
            {(item.nodes || []).map((node) => (
              <span
                key={node.id}
                className={`ew-history__step is-${STEP_TONE[node.status] || 'idle'}${node.mine ? ' is-mine' : ''}`}
                title={node.mine ? `Bước của bạn — ${node.name}` : node.name}
              >
                {node.node_code}
              </span>
            ))}
          </div>

          {expanded && <div className="ew-history__detail">
            {myNodes.map((node) => (
              <section key={node.id} className="ew-history__node">
                <h4>
                  <span className="ew-history__code">{node.node_code}</span>
                  {node.name}
                </h4>
                {node.checklist?.length
                  ? <ul className="ew-history__checklist">
                      {node.checklist.map((row) => (
                        <li key={row.id} className={`is-${CHECKLIST_TONE[row.status] || 'idle'}`}>
                          <FileText size={12} />
                          <span>{row.name}</span>
                          {row.evidence_files?.length > 0 && (
                            <em>{row.evidence_files.length} tệp</em>
                          )}
                        </li>
                      ))}
                    </ul>
                  : <p className="ew-history__empty">Bước này không có minh chứng phải nộp.</p>}
              </section>
            ))}
          </div>}
        </li>
      })}
    </ul>
  </Modal>
}
