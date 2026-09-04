import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, FolderOpen } from 'lucide-react'

import FilePreviewModal from '../../components/ui/FilePreviewModal'
import Modal from '../../components/ui/Modal'
import NodeDocumentCabinet from './NodeDocumentCabinet'
import { apiFetch, getAccessToken } from '../../lib/api'

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
 *
 * ── Xử lý lỗi HTTP ──────────────────────────────────────────────────────────
 * 401: token hết hạn → dispatch sự kiện unauthorized.
 * 403: nhân viên không thuộc nhóm thực hiện → nói rõ.
 * 404: tệp không tồn tại hoặc đã bị xoá.
 * 409: xung đột trạng thái → hiển thị lý do từ máy chủ.
 * 5xx: lỗi máy chủ → hiển thị thông báo chung.
 */

const ERROR_MESSAGE = {
  401: 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.',
  403: 'Bạn không có quyền xem tệp này.',
  404: 'Tệp này không tồn tại hoặc đã bị xoá.',
  409: 'Tệp đang trong trạng thái không thể mở.',
}

function dispatchUnauthorized() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bachkhoa:unauthorized'))
}

function humanizeHttpError(err) {
  if (err?.status && ERROR_MESSAGE[err.status]) return ERROR_MESSAGE[err.status]
  if (err?.status >= 500) return 'Máy chủ gặp sự cố. Hãy thử lại sau.'
  return err?.message || 'Không mở được tệp.'
}

export default function PriorDocumentsDrawer({
  open, taskNodeId, contractId, serviceLineId, currentNodeCode, onClose,
  onOpenDocument,
}) {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [openError, setOpenError] = useState(null)
  const objectUrlRef = useRef(null)

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

  // Thu hồi object URL khi unmount hoặc khi modal đóng.
  useEffect(() => () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
  }, [])

  const openFile = useCallback(async (doc) => {
    if (!taskNodeId) return
    setOpenError(null)
    try {
      const token = getAccessToken()
      const res = await fetch(
        `/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}/documents/${encodeURIComponent(doc.document_id)}/file`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!res.ok) {
        if (res.status === 401) dispatchUnauthorized()
        const body = await res.json().catch(() => null)
        const err = new Error(body?.detail || `HTTP ${res.status}`)
        err.status = res.status
        throw err
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        throw new Error('Tệp rỗng.')
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setPreview({ fileName: doc.name || 'tai-lieu', mimeType: blob.type || '', url, blob })
    } catch (err) {
      setOpenError(humanizeHttpError(err))
    }
  }, [taskNodeId])

  const closePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPreview(null)
  }, [])

  const effectiveOpenDocument = onOpenDocument || openFile
  const tongSo = (groups || []).reduce((sum, group) => sum + group.documents.length, 0)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Tủ hồ sơ">
      {/* Bộ giấy của CẢ hạng mục, xếp theo bước — đúng cây tab Mẫu giấy tờ. */}
      <NodeDocumentCabinet
        contractId={contractId}
        serviceLineId={serviceLineId}
        currentNodeCode={currentNodeCode}
        onOpenDocument={onOpenDocument || openFile}
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
          {openError && (
            <p className="eiw-drawer__msg is-error" role="alert">{openError}</p>
          )}
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
                      onClick={() => effectiveOpenDocument(doc)}
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

      <FilePreviewModal
        open={Boolean(preview)}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
        onClose={closePreview}
      />
    </Modal>
  )
}
