import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Pause, Play } from 'lucide-react'

import CustomerSourceDocuments from './CustomerSourceDocuments'
import SubmissionReceiptPanel from '../legal-dossier/SubmissionReceiptPanel'
import { formatMoney } from './nodeWorkFormat'

/**
 * Ô NGHIỆP VỤ — hàng thứ hai của cột phải, thứ duy nhất đổi theo bước.
 *
 * Bốn thẻ trong bản vẽ (K01·K04·K07, K05a, K05b, K06) dùng chung một khung; chỉ
 * ô này khác. Nên nó là một component riêng, và chọn nhánh bằng CỜ CẤU HÌNH đọc
 * từ danh mục — không phải bằng `if (node_code === 'K05b')`.
 *
 *   allow_pause         → dải tạm dừng / tiếp tục          (K05a, K05b)
 *   allow_gov_tracking  → thêm bảng theo dõi cơ quan       (chỉ K05b)
 *   is_handover         → thanh công nợ + lập phiếu nợ     (K06)
 *   mọi node            → kho giấy tờ khách gửi chưa phân loại
 *
 * Đổi bước nào có gì sau này là một câu update xuống danh mục, không phải sửa
 * mã rồi deploy.
 */

export default function NodeBusinessSlot({
  task,
  item,
  addToast,
  onRefresh,
  onPause,
  onResume,
  busy = false,
}) {
  const [customerDocsOpen, setCustomerDocsOpen] = useState(true)
  const paused = Boolean(task.pause_reason_type)

  const isHandover = Boolean(task.is_handover)
  const allowPause = Boolean(task.allow_pause)
  const allowGovTracking = Boolean(task.allow_gov_tracking)
  const requiresGovSubmission = Boolean(task.requires_gov_submission)

  useEffect(() => {
    setCustomerDocsOpen(true)
  }, [task.id])

  const handleCustomerDocumentsEmpty = useCallback((isEmpty) => {
    if (isEmpty) setCustomerDocsOpen(false)
  }, [])

  return (
    <>
      {/* Kho nguyên bản luôn đứng đầu vùng thao tác. Nó chỉ hiện tệp chưa phân
          loại; đích gán lấy từ checklist của chính node đang mở. */}
      <button
        type="button"
        className="eiw-band eiw-band--slot"
        aria-expanded={customerDocsOpen}
        aria-controls="customer-source-documents-panel"
        onClick={() => setCustomerDocsOpen(value => !value)}
      >
        <span>Kho giấy tờ khách gửi</span>
        <ChevronDown size={16} className={customerDocsOpen ? 'is-open' : ''} />
      </button>
      {customerDocsOpen && (
        <div id="customer-source-documents-panel" className="eiw-slotbody">
          <CustomerSourceDocuments
            contractId={item.contract_id}
            taskNodeId={task.id}
            checklist={task.checklist || []}
            addToast={addToast}
            onChanged={onRefresh}
            onEmptyChange={handleCustomerDocumentsEmpty}
          />
        </div>
      )}

      {/* ── K05a · K05b: dừng đồng hồ khi việc đứng vì lý do ngoài mình ── */}
      {allowPause && (
        paused ? (
          <div className="eiw-band eiw-band--paused">
            <span><Pause size={16} /> {task.paused_note || 'Đang tạm dừng'}</span>
            <button type="button" disabled={busy} onClick={onResume}>
              <Play size={14} /> Tiếp tục
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="eiw-band eiw-band--slot"
            disabled={busy || task.status !== 'in_progress'}
            onClick={onPause}
            title={task.status === 'in_progress'
              ? 'Dừng đồng hồ vì lý do ngoài tầm kiểm soát'
              : 'Chỉ tạm dừng được bước đang thực hiện'}
          >
            <span><Pause size={16} /> Tạm dừng</span>
          </button>
        )
      )}

      {/* ── Bảng theo dõi cơ quan (chỉ bật khi cấu hình yêu cầu) ── */}
      {(allowGovTracking || requiresGovSubmission) && (
        <div className="eiw-slotbody">
          <SubmissionReceiptPanel
            taskNodeId={task.id}
            addToast={addToast}
            onChanged={onRefresh}
          />
        </div>
      )}

      {/* K06 chỉ cần thanh công nợ trong vùng nội dung. Xin duyệt nợ và Nộp
          nghiệm thu nằm ở footer để không tạo thêm một panel checklist trùng. */}
      {isHandover && (
        <DebtBand item={item} />
      )}

    </>
  )
}

/**
 * Thanh công nợ của K06 — đã thu trên tổng.
 *
 * Đứng TRƯỚC nút lập phiếu nợ, vì con số này là thứ quyết định có cần xin nợ hay
 * không. Bày nút trước rồi mới tới số là mời người ta xin nợ khi khách đã trả đủ.
 */
function DebtBand({ item }) {
  const total = Number(item.contract_total_value || 0)
  const paid = Number(item.contract_paid_amount || 0)
  const settled = (total > 0 && total - paid <= 0.009) || (total === 0 && paid === 0)
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (settled ? 100 : 0)

  return (
    <div className={`eiw-debt${settled ? ' is-settled' : ''}`}>
      <span className="eiw-debt__fill" style={{ width: `${percent}%` }} aria-hidden="true" />
      <span className="eiw-debt__text">
        {formatMoney(paid)} / {formatMoney(total)}
        <b>{settled ? 'đã thu đủ' : `còn ${formatMoney(total - paid)}`}</b>
      </span>
    </div>
  )
}
