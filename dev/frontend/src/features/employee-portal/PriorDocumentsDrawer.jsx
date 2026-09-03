import { useEffect, useState } from 'react'
import { ArrowUpRight, FolderOpen } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import NodeDocumentCabinet from './NodeDocumentCabinet'
import { apiFetch } from '../../lib/api'

/**
 * Tủ hồ sơ — giấy CHÍNH THỨC của các bước đã hoàn thành, chỉ đọc.
 *
 * Khác Sổ giấy tờ (`DocumentRegister`): sổ trả danh mục Ô GIẤY của cả Hạng mục,
 * còn tủ này trả lời "các bước trước đã nộp ra những gì". Hai câu hỏi khác nhau,
 * nên không dùng chung một khối.
 *
 * ── Không nạp sẵn link mở tệp ───────────────────────────────────────────────
 * Máy chủ chỉ trả TÊN. Một hồ sơ đi hết bảy bước có vài chục tờ; ký sẵn từng đấy
 * link là vài chục lượt gọi kho tệp cho một thao tác mà người ta thường chỉ mở
 * một tờ. Bấm tờ nào thì mới xin link tờ đó.
 */

export default function PriorDocumentsDrawer({
  open, taskNodeId, contractId, serviceLineId, currentNodeCode, onClose, onOpenDocument,
}) {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !taskNodeId) return undefined
    let huy = false
    setGroups(null)
    setError(null)
    apiFetch(`/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}/prior-documents`)
      .then(res => { if (!huy) setGroups(res?.data || []) })
      .catch(err => { if (!huy) setError(err?.message || 'Không mở được tủ hồ sơ') })
    return () => { huy = true }
  }, [open, taskNodeId])

  const tongSo = (groups || []).reduce((sum, group) => sum + group.documents.length, 0)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Tủ hồ sơ">
      {/* Bộ giấy của CẢ hạng mục, xếp theo bước — đúng cây tab Mẫu giấy tờ. */}
      <NodeDocumentCabinet
        contractId={contractId}
        serviceLineId={serviceLineId}
        currentNodeCode={currentNodeCode}
        onOpenDocument={onOpenDocument}
      />

      <h4 className="eiw-drawer__phan">Tệp đã nộp ở các bước trước</h4>
      {error && <p className="eiw-drawer__msg is-error">{error}</p>}

      {!error && groups === null && <p className="eiw-drawer__msg">Đang mở tủ hồ sơ…</p>}

      {!error && groups !== null && groups.length === 0 && (
        // Bước đầu chuỗi thì chưa có bước nào trước. Nói rõ, đừng mở một khung
        // rỗng không lời rồi để người ta tưởng hỏng.
        <p className="eiw-drawer__msg">
          Chưa có bước nào hoàn thành trước bước này, nên tủ hồ sơ còn trống.
        </p>
      )}

      {!error && groups !== null && groups.length > 0 && (
        <>
          <p className="eiw-drawer__msg">
            <FolderOpen size={16} /> {tongSo} giấy tờ từ {groups.length} bước đã nghiệm thu
          </p>
          <div className="eiw-drawer__list">
            {groups.map(group => (
              <section className="eiw-drawer__group" key={`${group.node_code}`}>
                <h4>{group.node_code} · {group.node_name}</h4>
                {group.documents.map(doc => (
                  <div className="eiw-drawer__row" key={doc.document_id}>
                    <span>{doc.name}</span>
                    <button
                      type="button"
                      aria-label={`Mở ${doc.name}`}
                      onClick={() => onOpenDocument?.(doc)}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
