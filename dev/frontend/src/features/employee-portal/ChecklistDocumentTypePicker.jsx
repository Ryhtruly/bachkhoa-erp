import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, LoaderCircle, Search, X } from 'lucide-react'

import { apiFetch } from '../../lib/api'

const SOURCE_OPTIONS = [
  { value: 'KHACH_HANG', label: 'Khách hàng cung cấp' },
  { value: 'CONG_TY', label: 'Công ty soạn' },
  { value: 'CO_QUAN', label: 'Pháp lý' },
]

const endpointRoot = (taskNodeId, checklistResultId) => (
  `/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}`
  + `/checklist/${encodeURIComponent(checklistResultId)}`
)

export default function ChecklistDocumentTypePicker({
  taskNodeId,
  checklistResultId,
  onAdded,
  onClose,
  addToast,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [context, setContext] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [source, setSource] = useState('KHACH_HANG')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    apiFetch(`${endpointRoot(taskNodeId, checklistResultId)}/document-type-suggestions`)
      .then(payload => {
        if (cancelled) return
        setSuggestions(payload?.data || [])
        setContext(payload?.context || null)
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError?.message || 'Không tải được loại giấy gợi ý.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [taskNodeId, checklistResultId])

  const filteredSuggestions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi')
    if (!keyword || selected) return suggestions
    return suggestions.filter(item => item.name?.toLocaleLowerCase('vi').includes(keyword))
  }, [query, selected, suggestions])

  const chooseSuggestion = (suggestion) => {
    setSelected(suggestion)
    setCreating(false)
    setQuery(suggestion.name)
    setSource(suggestion.source)
    setError('')
    setActiveIndex(-1)
  }

  const startCreating = () => {
    setSelected(null)
    setCreating(true)
    setQuery('')
    setSource('KHACH_HANG')
    setError('')
    setActiveIndex(-1)
  }

  const optionCount = filteredSuggestions.length + 1
  const optionsId = `document-type-options-${checklistResultId}`
  const optionId = index => `${optionsId}-option-${index}`

  const chooseActiveOption = () => {
    if (activeIndex < 0) return
    if (activeIndex < filteredSuggestions.length) {
      chooseSuggestion(filteredSuggestions[activeIndex])
    } else {
      startCreating()
    }
  }

  const handleComboboxKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setActiveIndex(-1)
      onClose?.()
      return
    }
    if (loading || optionCount === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(current => (current + 1) % optionCount)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(current => (current <= 0 ? optionCount - 1 : current - 1))
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      chooseActiveOption()
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const name = query.trim()
    if (!selected && (!creating || !name)) {
      setError('Hãy chọn gợi ý hoặc nhập tên loại giấy mới.')
      return
    }

    setBusy(true)
    setError('')
    let created
    try {
      const createdPayload = await apiFetch(
        `${endpointRoot(taskNodeId, checklistResultId)}/document-types`,
        {
          method: 'POST',
          body: JSON.stringify(
            selected
              ? { template_id: selected.template_id }
              : { name, source },
          ),
        },
      )
      created = createdPayload?.data || createdPayload
    } catch (requestError) {
      const message = requestError?.message || 'Không thêm được loại giấy vào checklist.'
      setError(message)
      addToast?.(message, 'error')
      setBusy(false)
      return
    }

    try {
      if (files.length > 0) {
        const body = new FormData()
        files.forEach(file => body.append('files', file))
        const uploaded = await apiFetch(
          `${endpointRoot(taskNodeId, checklistResultId)}`
            + `/document-types/${encodeURIComponent(created.id)}/files`,
          { method: 'POST', body },
        )
        const failed = (uploaded?.data || []).filter(item => item?.status === 'failed')
        if (failed.length > 0) {
          addToast?.(`${failed.length} tệp chưa tải được. Bạn có thể tải lại ngay tại loại giấy.`, 'warning')
        }
      }
      addToast?.(`Đã thêm ${created.name || selected?.name || name} vào checklist.`, 'success')
    } catch {
      const message = 'Đã tạo loại giấy nhưng file chưa tải được. Bạn có thể tải lại tại hàng loại giấy.'
      setError(message)
      addToast?.(message, 'warning')
    } finally {
      onAdded?.(created)
      setBusy(false)
    }
  }

  const sourceValue = selected?.source || source
  const contextText = [
    context?.service_package_name,
    context?.task_type_name,
    context?.node_code,
  ].filter(Boolean).join(' · ')

  return (
    <form className="eiw-type-picker" onSubmit={submit}>
      <div className="eiw-type-picker__head">
        <div>
          <strong>Thêm loại giấy</strong>
          {contextText && <p className="eiw-type-picker__context">{contextText}</p>}
        </div>
        <button type="button" className="eiw-type-picker__close" onClick={onClose} aria-label="Đóng thêm loại giấy">
          <X size={16} />
        </button>
      </div>

      <div className="eiw-type-picker__grid">
        <label className="eiw-type-picker__field eiw-type-picker__field--name">
          <span>{creating ? 'Tên loại giấy' : 'Loại giấy'}</span>
          <span className="eiw-type-picker__search">
            <Search size={15} aria-hidden="true" />
            <input
              role={creating ? undefined : 'combobox'}
              aria-label={creating ? 'Tên loại giấy' : 'Loại giấy'}
              aria-expanded={!creating && !selected}
              aria-controls={!creating ? optionsId : undefined}
              aria-autocomplete={!creating ? 'list' : undefined}
              aria-activedescendant={!creating && !selected && activeIndex >= 0
                ? optionId(activeIndex)
                : undefined}
              value={query}
              placeholder={creating ? 'Nhập tên loại giấy phát sinh' : 'Tìm loại giấy đã cấu hình'}
              onChange={event => {
                setQuery(event.target.value)
                if (selected) setSelected(null)
                setActiveIndex(-1)
              }}
              onKeyDown={handleComboboxKeyDown}
            />
          </span>
        </label>

        <label className="eiw-type-picker__field">
          <span>Nhóm</span>
          <select
            aria-label="Nhóm"
            value={sourceValue}
            disabled={Boolean(selected)}
            onChange={event => setSource(event.target.value)}
          >
            {SOURCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {!creating && !selected && (
        <ul className="eiw-type-picker__options" role="listbox" id={optionsId}>
          {loading ? (
            <li className="eiw-type-picker__loading"><LoaderCircle size={15} className="is-spinning" /> Đang tải gợi ý…</li>
          ) : (
            <>
              {filteredSuggestions.map((suggestion, index) => (
                <li
                  key={suggestion.template_id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={activeIndex === index}
                  tabIndex={-1}
                  className={activeIndex === index ? 'is-active' : undefined}
                  onClick={() => chooseSuggestion(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      chooseSuggestion(suggestion)
                    }
                  }}
                >
                  <span>{suggestion.name}</span>
                  <em>{suggestion.source_label}</em>
                </li>
              ))}
              <li
                id={optionId(filteredSuggestions.length)}
                role="option"
                aria-selected={activeIndex === filteredSuggestions.length}
                tabIndex={-1}
                className={`eiw-type-picker__create${activeIndex === filteredSuggestions.length ? ' is-active' : ''}`}
                onClick={startCreating}
                onMouseEnter={() => setActiveIndex(filteredSuggestions.length)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    startCreating()
                  }
                }}
              >
                <FilePlus2 size={15} /> Không thấy loại giấy — Tạo mới
              </li>
            </>
          )}
        </ul>
      )}

      <label className="eiw-type-picker__files">
        <span>File hoặc ảnh</span>
        <input
          type="file"
          multiple
          aria-label="Chọn file hoặc ảnh"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.dgn"
          onChange={event => setFiles(Array.from(event.target.files || []))}
        />
      </label>
      {files.length > 0 && (
        <ul className="eiw-type-picker__selected" aria-label="Tệp đã chọn">
          {files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`}>{file.name}</li>)}
        </ul>
      )}

      {error && <p className="eiw-type-picker__error" role="alert">{error}</p>}

      <div className="eiw-type-picker__actions">
        <button type="button" className="eiw-btn eiw-btn--ghost" onClick={onClose}>Hủy</button>
        <button type="submit" className="eiw-btn eiw-btn--primary" disabled={busy || loading}>
          {busy ? 'Đang thêm…' : 'Thêm vào checklist'}
        </button>
      </div>
    </form>
  )
}
