import { useEffect, useState } from 'react'

import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'

/**
 * Chọn bước để kéo quy trình quay lại — chỉ mở khi tạm dừng vì SURVEYOR.
 *
 * ── Vùng ảnh hưởng do MÁY CHỦ tính ──────────────────────────────────────────
 * Kéo K02 về sửa thì K03, K04… cũng phải làm lại. Nhưng tự tô màu theo thứ tự
 * trên sơ đồ là sai với quy trình có nhánh — người bấm gửi tưởng mình mở lại ba
 * bước, thực tế mở lại năm. Nên mỗi lần chọn một bước là hỏi lại máy chủ.
 *
 * ── Vì sao vẫn phải Giám đốc duyệt ──────────────────────────────────────────
 * Mở lại những bước đã nghiệm thu xong là việc nặng: tiền khoán đã chốt, giấy đã
 * duyệt phải hạ về chờ duyệt lại. Không để một người tự quyết — gửi ở đây là gửi
 * một YÊU CẦU, không phải thực hiện.
 */

export default function RollbackPickerModal({
  open,
  nodes = [],
  currentTaskNodeId,
  onClose,
  onSubmit,
  busy = false,
}) {
  const [picked, setPicked] = useState(null)
  const [preview, setPreview] = useState(null)
  const [note, setNote] = useState('')

  // Chỉ kéo về được bước ĐÃ CHẠY và nằm TRƯỚC bước hiện tại.
  const viTriHienTai = nodes.findIndex(node => node.id === currentTaskNodeId)
  const chonDuoc = nodes.filter((node, index) =>
    index < viTriHienTai && !['pending', 'blocked', 'cancelled'].includes(node.status))

  useEffect(() => {
    if (!picked) { setPreview(null); return undefined }
    let huy = false
    setPreview(null)
    apiFetch(`/api/contracts/workflow/nodes/${encodeURIComponent(picked)}/rollback-preview`)
      .then(res => { if (!huy) setPreview(res) })
      .catch(() => { if (!huy) setPreview(null) })
    return () => { huy = true }
  }, [picked])

  const anhHuong = new Set(
    (preview?.nodes || []).filter(node => node.will_reset).map(node => node.task_node_id))
  const nodeDaChon = nodes.find(node => node.id === picked) || null
  const ready = Boolean(picked) && note.trim().length >= 5

  const close = () => { setPicked(null); setPreview(null); setNote(''); onClose?.() }

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Chọn bước để quay lại"
      footer={
        <div className="eiw-modal__foot">
          <button type="button" className="eiw-btn" onClick={close}>Huỷ</button>
          <button
            type="button"
            className="eiw-btn eiw-btn--go"
            disabled={!ready || busy}
            onClick={() => onSubmit?.({ target_task_node_id: picked, reason: note.trim() })}
          >
            Gửi yêu cầu
          </button>
        </div>
      }
    >
      <div className="eiw-picker">
        <div className="eiw-picker__detail">
          {nodeDaChon ? (
            <>
              <h4>{nodeDaChon.node_code} · {nodeDaChon.name}</h4>
              <dl>
                <div><dt>Người phụ trách</dt><dd>{nodeDaChon.assignee_name || 'Chưa phân công'}</dd></div>
                <div><dt>Trạng thái</dt><dd>{nodeDaChon.status}</dd></div>
              </dl>
              {preview && (
                <p className="eiw-picker__impact">
                  Gửi đi sẽ kéo <b>{anhHuong.size}</b> bước về trạng thái cần sửa.
                </p>
              )}
            </>
          ) : (
            <p className="eiw-picker__hint">Chọn một bước ở cột bên phải để xem chi tiết.</p>
          )}
        </div>

        <ul className="eiw-picker__nodes">
          {chonDuoc.length === 0 && (
            <li className="eiw-picker__hint">Chưa có bước nào đã chạy để quay lại.</li>
          )}
          {chonDuoc.map(node => {
            const tone = node.id === picked ? 'picked'
              : anhHuong.has(node.id) ? 'reset'
                : preview ? 'safe' : 'idle'
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className={`eiw-picker__node is-${tone}`}
                  aria-pressed={node.id === picked}
                  onClick={() => setPicked(node.id)}
                >
                  <b>{node.node_code}</b>
                  <span>{node.name}</span>
                  {anhHuong.has(node.id) && node.id !== picked && <em>sẽ phải làm lại</em>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <label className="eiw-modal__field">
        <span>Ghi chú cho Giám đốc</span>
        <textarea
          rows={3}
          value={note}
          placeholder="Ví dụ: Bản vẽ sai ranh mốc số 4, giáp ranh đường."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
    </Modal>
  )
}
