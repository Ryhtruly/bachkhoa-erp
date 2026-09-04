import { useEffect, useMemo, useState } from 'react'
import { FileText, Link2, LoaderCircle } from 'lucide-react'

import { apiFetch } from '../../lib/api'

/**
 * Kho tệp nguyên bản khách giao lúc lập hợp đồng.
 *
 * Component này cố ý không dùng DocumentRegister: sổ đó còn chứa các nhóm loại
 * giấy theo nguồn (khách/công ty/cơ quan), trong khi ô này chỉ được phép hiện
 * TỆP THÔ chưa phân loại và đích gán phải đến từ checklist đang làm.
 */
export default function CustomerSourceDocuments({
  contractId,
  taskNodeId,
  checklist = [],
  addToast,
  onChanged,
}) {
  const [documents, setDocuments] = useState(null)
  const [error, setError] = useState('')
  const [classifyingId, setClassifyingId] = useState(null)
  const [selectedByDocument, setSelectedByDocument] = useState({})
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!contractId) return undefined
    let cancelled = false
    setDocuments(null)
    setError('')
    apiFetch(`/api/document-register/contracts/${encodeURIComponent(contractId)}/source-documents`)
      .then(payload => {
        if (!cancelled) setDocuments((payload?.data || []).filter(doc => !(doc.slots || []).length))
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError?.message || 'Không đọc được kho giấy khách gửi.')
      })
    return () => { cancelled = true }
  }, [contractId])

  const targets = useMemo(() => checklist.flatMap(item => {
    const hasRuntimeTypes = Object.prototype.hasOwnProperty.call(item || {}, 'document_types')
    if (hasRuntimeTypes) {
      return (item.document_types || [])
        .filter(type => type.source === 'KHACH_HANG' && type.status !== 'approved')
        .map(type => ({
          value: `${item.id}::${type.id}`,
          checklistResultId: item.id,
          documentTypeId: type.id,
          label: `${item.name || 'Checklist'} · ${type.name || type.id}`,
        }))
    }
    return (item.output_documents || []).map(doc => ({
      value: `${item.id}::${doc.template_id}`,
      checklistResultId: item.id,
      templateId: doc.template_id,
      label: `${item.name || 'Checklist'} · ${item.template_names?.[doc.template_id] || doc.name || doc.template_id}`,
      reviewStatus: item.review_by_template?.[doc.template_id]?.review_status,
    })).filter(target => target.templateId && target.reviewStatus !== 'approved')
  }), [checklist])

  const assign = async (document) => {
    const selected = selectedByDocument[document.id]
    const target = targets.find(candidate => candidate.value === selected)
    if (!target || !taskNodeId) return
    setBusyId(document.id)
    try {
      await apiFetch(
        `/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}`
          + `/checklist/${encodeURIComponent(target.checklistResultId)}`
          + `/source-documents/${encodeURIComponent(document.id)}`,
        {
          method: 'POST',
          body: JSON.stringify(
            target.documentTypeId
              ? { document_type_id: target.documentTypeId }
              : { template_id: target.templateId },
          ),
        },
      )
      setDocuments(current => (current || []).filter(row => row.id !== document.id))
      setClassifyingId(null)
      addToast?.(`Đã phân loại ${document.file_name}`, 'success')
      onChanged?.()
    } catch (requestError) {
      addToast?.(requestError?.message || 'Không phân loại được giấy tờ.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <p className="eiw-source-docs__message is-error" role="alert">{error}</p>
  if (documents === null) {
    return <p className="eiw-source-docs__message"><LoaderCircle size={15} className="is-spinning" /> Đang mở kho giấy…</p>
  }
  if (documents.length === 0) {
    return <p className="eiw-source-docs__message">Không còn giấy nguyên bản nào chưa phân loại.</p>
  }

  return (
    <ul className="eiw-source-docs" aria-label="Giấy nguyên bản chưa phân loại">
      {documents.map(document => {
        const opened = classifyingId === document.id
        const selected = selectedByDocument[document.id] || ''
        return (
          <li key={document.id}>
            <div className="eiw-source-docs__row">
              <span className="eiw-source-docs__icon"><FileText size={15} /></span>
              <span className="eiw-source-docs__name">{document.file_name}</span>
              <span className="eiw-source-docs__tag">Chưa phân loại</span>
              <button
                type="button"
                className="eiw-source-docs__classify"
                onClick={() => setClassifyingId(opened ? null : document.id)}
                aria-expanded={opened}
              >
                <Link2 size={13} /> Phân loại
              </button>
            </div>
            {opened && (
              <div className="eiw-source-docs__picker">
                {targets.length > 0 ? (
                  <>
                    <select
                      aria-label="Loại giấy trong checklist"
                      value={selected}
                      onChange={event => setSelectedByDocument(current => ({
                        ...current,
                        [document.id]: event.target.value,
                      }))}
                    >
                      <option value="">— Chọn loại giấy trong checklist —</option>
                      {targets.map(target => (
                        <option key={target.value} value={target.value}>{target.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selected || busyId === document.id}
                      onClick={() => assign(document)}
                    >
                      {busyId === document.id ? 'Đang gán…' : 'Gán'}
                    </button>
                  </>
                ) : (
                  <span>Checklist này chưa có loại giấy nào có thể nhận tệp.</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
