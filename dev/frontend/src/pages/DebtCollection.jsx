import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock3, Lock, PackageCheck, Plus,
  RefreshCw, Trash2, ArrowRightLeft, AlertCircle, ReceiptText
} from 'lucide-react'
import Modal from '../components/ui/Modal'
import { SensitiveActionModal, FilterBar, Select } from '../components/ui'
import ReceiptFileInput from '../components/finance/ReceiptFileInput'
import ReceiptLinks from '../components/finance/ReceiptLinks'
import { buildPaymentFormData } from '../components/finance/paymentReceipts'
import { useToast } from '../contexts/ToastContext'
import { apiFetch, getAccessToken } from '../lib/api'
import './debtCollection.css'

/**
 * Thu Công Nợ — màn hình làm việc của Kế toán & Giám đốc.
 *
 * Danh sách này tự sinh từ dữ liệu thu tiền thật. Hồ sơ K06 từng được duyệt
 * giao trước giữ lại một card lịch sử: đỏ khi còn nợ, xanh khi kế toán đã thu đủ.
 */

const formatMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')}₫`

const formatDate = (v) => {
  if (!v) return ''
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return v
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch { return v }
}

const getDaysDiff = (v) => {
  if (!v) return null
  const d = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000)
  return d > 0 ? d : 0
}

export default function DebtCollection({ user = null, isDirector = false, initialSearch = '' }) {
  const toast = useToast()
  const addToast = toast?.addToast || (() => {})
  const [currentUser, setCurrentUser] = useState(user || null)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0, total_remaining: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recordingRow, setRecordingRow] = useState(null)
  const [writingOffRow, setWritingOffRow] = useState(null)
  const realtimeRefreshRef = useRef(null)

  useEffect(() => {
    if (!user) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {})
    } else {
      setCurrentUser(user)
    }
  }, [user])

  const effectiveIsDirector = Boolean(
    isDirector ||
    currentUser?.is_director ||
    currentUser?.username === 'admin' ||
    currentUser?.role_name === 'admin'
  )

  // State cho Modal Chuyển Nợ Sang HĐ Mới
  const [transferringRow, setTransferringRow] = useState(null)
  const [targetContractId, setTargetContractId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [eligibleTargets, setEligibleTargets] = useState([])
  const [loadingTargets, setLoadingTargets] = useState(false)

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: '', payment_method: 'CASH', note: '' })
  const [receiptFiles, setReceiptFiles] = useState([])

  const [search, setSearch] = useState(initialSearch)
  const [filterDelivery, setFilterDelivery] = useState('All')

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const payload = await apiFetch('/api/handover/outstanding')
      setRows(payload.data || [])
      setMeta(payload.meta || { total: 0, total_remaining: 0 })
    } catch (err) {
      setError(err.message || 'Mất kết nối tới máy chủ.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(false), 30000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!effectiveIsDirector) return undefined

    let disposed = false
    let abortController = null

    const refreshFromRealtime = () => {
      window.clearTimeout(realtimeRefreshRef.current)
      realtimeRefreshRef.current = window.setTimeout(() => load(false), 150)
    }
    const subscribe = async () => {
      while (!disposed) {
        abortController = new AbortController()
        try {
          const token = getAccessToken?.()
          if (!token) return
          const response = await fetch('/api/contracts/timeline/events', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            cache: 'no-store',
            signal: abortController.signal,
          })
          if (response.status === 401 || response.status === 403) return
          if (!response.ok || !response.body) throw new Error('Mất kết nối cập nhật công nợ')

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (!disposed) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const blocks = buffer.split('\n\n')
            buffer = blocks.pop() || ''
            if (blocks.some((block) => block.includes('event: timeline-change'))) {
              refreshFromRealtime()
            }
          }
        } catch (streamError) {
          if (disposed || streamError?.name === 'AbortError') return
        }
        if (!disposed) await new Promise((resolve) => window.setTimeout(resolve, 1500))
      }
    }

    subscribe()
    return () => {
      disposed = true
      window.clearTimeout(realtimeRefreshRef.current)
      abortController?.abort()
    }
  }, [load, effectiveIsDirector])

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch)
  }, [initialSearch])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const q = search.trim().toLowerCase()
      const matchSearch = !q ||
        (r.contract_id || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.service_type || '').toLowerCase().includes(q) ||
        (r.deliverer_name || '').toLowerCase().includes(q)

      if (!matchSearch) return false

      const isDelivered = Boolean(r.is_delivered)

      if (filterDelivery !== 'All') {
        if (filterDelivery === 'delivered' && !isDelivered) return false
        if (filterDelivery === 'undelivered' && isDelivered) return false
        if (filterDelivery === 'late') {
          const daysOverdue = getDaysDiff(r.delivered_at)
          if (!isDelivered || (daysOverdue || 0) < 7) return false
        }
      }
      return true
    })
  }, [rows, search, filterDelivery])

  const debtSummary = useMemo(() => {
    const overdue = rows.filter(r => r.is_delivered && getDaysDiff(r.delivered_at) >= 7)
    const awaitingDelivery = rows.filter(r => !r.is_delivered)
    return {
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, row) => sum + Number(row.remaining || 0), 0),
      awaitingDeliveryCount: awaitingDelivery.length,
    }
  }, [rows])

  const deliveryFilterLabel = {
    delivered: 'Đã bàn giao',
    undelivered: 'Chưa bàn giao',
    late: 'Nợ quá 7 ngày',
  }[filterDelivery]

  const handleOpenTransferDebt = async (r) => {
    setTransferringRow(r)
    setTargetContractId('')
    setTransferReason('')
    setEligibleTargets([])
    setLoadingTargets(true)
    try {
      const payload = await apiFetch(`/api/contracts/${encodeURIComponent(r.contract_id)}/eligible-carry-forward-targets`)
      const targets = payload?.targets || []
      setEligibleTargets(targets)
      if (targets.length === 1) {
        setTargetContractId(targets[0].id)
      }
    } catch {
      setEligibleTargets([])
    } finally {
      setLoadingTargets(false)
    }
  }

  const selectedTarget = useMemo(() => {
    return eligibleTargets.find(t => t.id === targetContractId) || null
  }, [eligibleTargets, targetContractId])

  const handleRecordPayment = async () => {
    setSaving(true)
    try {
      // Thu theo HỢP ĐỒNG, không theo bước bàn giao: hợp đồng chưa chạy tới bước
      // đó, hoặc đã chốt bước đó rồi mà khách còn khất, đều phải ghi được.
      await apiFetch(`/api/handover/contracts/${encodeURIComponent(recordingRow.contract_id)}/payments`, {
        method: 'POST',
        body: buildPaymentFormData(form, receiptFiles),
      })
      addToast(`Đã ghi nhận ${formatMoney(form.amount)} — chờ giám đốc duyệt`, 'success')
      setRecordingRow(null)
      setForm({ amount: '', payment_method: 'CASH', note: '' })
      setReceiptFiles([])
      load(false)
    } catch (err) {
      addToast(err.message || 'Không ghi nhận được khoản thu', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleWriteOffDebt = async (reason) => {
    if (!writingOffRow?.contract_id) return
    setSaving(true)
    try {
      await apiFetch(`/api/contracts/${encodeURIComponent(writingOffRow.contract_id)}/write-off-debt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      addToast(`Giám đốc đã duyệt xóa nợ / miễn giảm cho hợp đồng ${writingOffRow.contract_id}!`, 'success')
      setWritingOffRow(null)
      await load()
    } catch (err) {
      addToast(err.message || 'Lỗi duyệt xóa nợ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCarryForwardDebt = async () => {
    if (!transferringRow?.contract_id || !targetContractId.trim() || !transferReason.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/api/contracts/${encodeURIComponent(transferringRow.contract_id)}/carry-forward-debt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_contract_id: targetContractId.trim(),
          reason: transferReason.trim()
        })
      })
      addToast(`Giám đốc đã duyệt chuyển nợ ${formatMoney(transferringRow.remaining)} sang hợp đồng ${targetContractId}!`, 'success')
      setTransferringRow(null)
      setTargetContractId('')
      setTransferReason('')
      await load()
    } catch (err) {
      addToast(err.message || 'Lỗi chuyển nợ', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="debt card card--workspace debt-workspace" style={{ padding: '20px 24px', borderRadius: 14 }}>
      <header className="debt__head">
        <div>
          <span className="debt__eyebrow">Kế toán & Giám đốc</span>
          <h2>Thu công nợ & Xử lý nợ tồn</h2>
          <p>Đỏ là hồ sơ đã được giao trước nhưng còn nợ; xanh chỉ xuất hiện sau khi phiếu thu được duyệt và số dư thực tế bằng 0.</p>
        </div>
        <div className="debt__head-actions">
          <span className="debt__sync-note">Tự cập nhật mỗi 30 giây</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>
      </header>

      <div className="debt__totals-grid">
        <div className="debt__total-card debt__total-card--primary">
          <div className="debt__total-icon">
            <ReceiptText size={20} />
          </div>
          <div className="debt__total-content">
            <span>Hợp đồng đang nợ</span>
            <strong>{meta.total} <small>hồ sơ</small></strong>
            <p>Hồ sơ chưa thu đủ 100%</p>
          </div>
        </div>
        <div className="debt__total-card debt__total-card--highlight">
          <div className="debt__total-icon">
            <AlertCircle size={20} />
          </div>
          <div className="debt__total-content">
            <span>Tổng còn phải thu</span>
            <strong>{formatMoney(meta.total_remaining)}</strong>
            <p>Cần tiếp tục đôn đốc thu nợ</p>
          </div>
        </div>
        <div className="debt__total-card debt__total-card--danger">
          <div className="debt__total-icon"><AlertTriangle size={20} /></div>
          <div className="debt__total-content">
            <span>Cần ưu tiên</span>
            <strong>{debtSummary.overdueCount} <small>hồ sơ</small></strong>
            <p>Đã bàn giao quá 7 ngày · {formatMoney(debtSummary.overdueAmount)}</p>
          </div>
        </div>
        <div className="debt__total-card debt__total-card--waiting">
          <div className="debt__total-icon"><PackageCheck size={20} /></div>
          <div className="debt__total-content">
            <span>Chưa bàn giao</span>
            <strong>{debtSummary.awaitingDeliveryCount} <small>hồ sơ đang chờ</small></strong>
            <p>Cần theo dõi tiến độ hồ sơ</p>
          </div>
        </div>
        {Number(meta.settled_after_override || 0) > 0 && (
          <div className="debt__total debt__total--settled">
            <span>Đã tất toán sau ngoại lệ</span>
            <strong>{meta.settled_after_override}</strong>
          </div>
        )}
      </div>

      <div className="debt__filter-wrap">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Tìm mã hợp đồng, khách hàng, dịch vụ, người giao..."
          filters={[
            {
              key: 'delivery',
              label: 'Tình trạng giao',
              type: 'select',
              width: 190,
              options: [
                { value: 'All', label: 'Tất cả tình trạng' },
                { value: 'delivered', label: 'Đã bàn giao' },
                { value: 'undelivered', label: 'Chưa bàn giao' },
                { value: 'late', label: 'Nợ quá 7 ngày' },
              ]
            }
          ]}
          values={{ delivery: filterDelivery }}
          onFilterChange={(_, v) => setFilterDelivery(v)}
          onReset={() => { setSearch(''); setFilterDelivery('All'); }}
        />
        <div className="debt__filter-summary" aria-live="polite">
          <span>Theo dữ liệu đã tải</span>
          <span>{filteredRows.length}/{rows.length} hồ sơ đang hiển thị</span>
          {search.trim() && <span className="debt__filter-chip">Từ khóa: {search.trim()}</span>}
          {deliveryFilterLabel && <span className="debt__filter-chip">{deliveryFilterLabel}</span>}
        </div>
      </div>

      {loading ? (
        <p className="debt__msg">Đang tải…</p>
      ) : error ? (
        <div className="debt__msg debt__msg--error">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>Thử lại</button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="debt__empty">
          <CheckCircle2 size={30} />
          <strong>{rows.length === 0 ? 'Không còn hợp đồng nào nợ tiền' : 'Không có hợp đồng nào khớp bộ lọc'}</strong>
          <span>{rows.length === 0 ? 'Mọi hợp đồng đều đã thu đủ hoặc được Giám đốc xử lý tất toán.' : 'Thử đổi từ khóa hoặc bộ lọc tình trạng giao.'}</span>
        </div>
      ) : (
        <ul className="debt__list">
          {filteredRows.map((r) => {
            const daysOverdue = getDaysDiff(r.delivered_at)
            const hasDebtApproval = Boolean(
              r.has_handover_debt_approval || r.completion_override
            )
            const isSettledAfterOverride = Boolean(
              hasDebtApproval && (r.is_financially_settled || Number(r.remaining || 0) <= 0.009)
            )
            const isOverrideAlert = Boolean(
              hasDebtApproval && !isSettledAfterOverride && Number(r.remaining || 0) > 0.009
            )
            return (
              <li
                key={r.contract_id}
                className={`debt__card${isOverrideAlert ? ' is-override-alert' : ''}${isSettledAfterOverride ? ' is-settled-after-override' : ''}`}
              >
                <div className="debt__card-layout">
                  {/* Cột trái: Thông tin hợp đồng, công nợ, cảnh báo & thao tác */}
                  <div className="debt__card-left">
                    <div className="debt__card-head">
                      <div>
                        <span className="debt__contract">{r.contract_id}</span>
                        <strong className="debt__customer">{r.customer_name || 'Chưa có tên khách'}</strong>
                        <span className="debt__service">{r.service_type}</span>
                      </div>
                      {isSettledAfterOverride ? (
                        <span className="debt__age is-settled-badge">Đã thu đủ tiền hợp đồng</span>
                      ) : isOverrideAlert ? (
                        <span className="debt__age is-override-badge">
                          {r.is_delivered ? 'Đã giao sổ (Sếp duyệt nợ)' : 'Đã duyệt giao khi còn nợ'}
                        </span>
                      ) : r.is_delivered ? (
                        <span className={`debt__age${daysOverdue >= 7 ? ' is-late' : ''}`}>
                          {daysOverdue === 0 ? 'Giao hôm nay' : `Đã giao ${daysOverdue} ngày`}
                        </span>
                      ) : (
                        <span className={`debt__age ${r.blocked_reason ? 'debt__age--blocked' : 'debt__age--waiting'}`}>
                          {r.blocked_reason ? 'Chờ pháp lý'
                            : r.task_node_id ? 'Chưa bàn giao'
                            : 'Chưa tới bước giao'}
                        </span>
                      )}
                    </div>

                    <div className="debt__bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, Math.round((r.paid / (r.total_value || 1)) * 100))}%` }} />
                    </div>

                    <div className="debt__figures">
                      <span>Giá trị <strong>{formatMoney(r.total_value)}</strong></span>
                      <span>Đã thu <strong>{formatMoney(r.paid)}</strong></span>
                      <span className="is-owed">Còn thiếu <strong>{formatMoney(r.remaining)}</strong></span>
                    </div>

                    {/* Phiếu đã gửi nhưng chưa được duyệt thì công nợ chưa giảm */}
                    {r.pending > 0 && (
                      <p className="debt__pending">
                        <Clock3 size={13} /> {formatMoney(r.pending)} đã gửi, chờ Giám đốc duyệt — duyệt xong mới trừ công nợ
                      </p>
                    )}

                    {r.blocked_reason && (
                      <p className="debt__blocked"><Lock size={13} /> {r.blocked_reason}</p>
                    )}

                    {isOverrideAlert && (
                      <div className="debt__alert-override" role="alert">
                        <strong><AlertTriangle size={15} /> Giám đốc đã duyệt giao hồ sơ khi còn công nợ</strong>
                        <p>
                          Lý do: <span>{r.handover_debt_reason || r.completion_override_reason || 'Chưa ghi lý do'}</span>
                          {r.deliverer_name ? ` · Người giao: ${r.deliverer_name}` : ''}
                        </p>
                      </div>
                    )}

                    {isSettledAfterOverride && (
                      <div className="debt__settled-confirmation" role="status">
                        <strong><CheckCircle2 size={15} /> Đã thu đủ tiền hợp đồng</strong>
                        <p>K06 đã được nghiệm thu và công nợ thực tế đã về 0 sau khi phiếu thu được duyệt.</p>
                      </div>
                    )}

                    {/* Chỉ nói "chờ ai đó giao" khi quy trình thật sự có bước bàn giao */}
                    {r.task_node_id && !r.is_delivered && !r.blocked_reason && (
                      <p className="debt__waiting">
                        <PackageCheck size={13} /> Chờ {r.deliverer_name || 'người phụ trách hồ sơ'} giao hồ sơ cho khách
                      </p>
                    )}

                    <div className="debt__actions">
                      {r.remaining > 0 && (
                        <>
                          {!effectiveIsDirector && (
                            <button type="button" className="btn btn-primary btn-sm"
                              onClick={() => {
                                setRecordingRow(r)
                                setForm({ amount: '', payment_method: 'CASH', note: '' })
                                setReceiptFiles([])
                              }}>
                              <Plus size={14} /> Ghi nhận thanh toán
                            </button>
                          )}

                          {effectiveIsDirector && (
                            <>
                              <button type="button" className="btn btn-secondary btn-sm"
                                style={{ color: '#9333ea', borderColor: '#9333ea44' }}
                                onClick={() => setWritingOffRow(r)}
                                title="Giám đốc duyệt xóa nợ hoặc miễn giảm"
                              >
                                <Trash2 size={14} /> Xóa nợ / Miễn giảm
                              </button>

                              <button type="button" className="btn btn-secondary btn-sm"
                                style={{ color: '#2563eb', borderColor: '#2563eb44' }}
                                onClick={() => handleOpenTransferDebt(r)}
                                title="Giám đốc duyệt chuyển nợ sang hợp đồng mới"
                              >
                                <ArrowRightLeft size={14} /> Chuyển nợ sang HĐ mới
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cột phải: Lịch sử các đợt ghi nhận thanh toán */}
                  <div className="debt__card-right">
                    <div className="debt__history-box">
                      <div className="debt__history-head">
                        <span className="debt__history-title">
                          <ReceiptText size={14} /> Lịch sử thu tiền
                        </span>
                        <span className="debt__history-count">
                          {(r.installments || []).length} đợt
                        </span>
                      </div>

                      {r.installments && r.installments.length > 0 ? (
                        <ul className="debt__history-list">
                          {r.installments.map((inst) => (
                            <li key={inst.id} className={`debt__history-item${inst.is_approved ? '' : ' is-pending'}`}>
                              <div className="debt__history-item-top">
                                <span className="debt__history-date">
                                  {formatDate(inst.transaction_date)}
                                </span>
                                <strong className="debt__history-amount">
                                  {formatMoney(inst.amount)}
                                </strong>
                              </div>
                              <div className="debt__history-item-bottom">
                                <span className="debt__history-method">
                                  {inst.payment_method_label || (inst.payment_method === 'BANK_TRANSFER' || inst.payment_method === 'Chuyển khoản' ? 'Chuyển khoản' : 'Tiền mặt')}
                                </span>
                                <div className="debt__history-extra">
                                  {inst.receipt_attachments?.length || inst.receipt_attachment_url ? (
                                    <ReceiptLinks
                                      attachments={inst.receipt_attachments}
                                      legacyUrl={inst.receipt_attachment_url}
                                      addToast={addToast}
                                      compact
                                    />
                                  ) : (
                                    <span className="debt__history-nobill" title="Chưa có ảnh bill">—</span>
                                  )}
                                  <span className={`debt__history-status${inst.is_approved ? ' is-approved' : ' is-waiting'}`}>
                                    {inst.is_approved ? 'Đã duyệt' : 'Chờ duyệt'}
                                  </span>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="debt__history-empty">
                          <span>Chưa có đợt thu nào</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Modal Ghi Nhận Thanh Toán */}
      <Modal open={Boolean(recordingRow)} onClose={() => { setRecordingRow(null); setReceiptFiles([]) }} title="Ghi nhận thanh toán">
        {recordingRow && (
          <div className="debt__form">
            <p className="debt__form-hint">
              <strong>{recordingRow.customer_name}</strong> · {recordingRow.contract_id}<br />
              Còn thiếu <strong>{formatMoney(recordingRow.remaining)}</strong>. Phiếu tạo ra ở trạng thái
              <strong> Chờ duyệt</strong> — công nợ chỉ giảm sau khi giám đốc duyệt.
            </p>
            <label>Số tiền khách đưa
              <input className="form-control" type="number" min="0" max={recordingRow.remaining}
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <div className="receipt-field">
              <span className="receipt-field__label">Ảnh bill / biên lai <span className="debt__req">*</span></span>
              <ReceiptFileInput files={receiptFiles} onChange={setReceiptFiles} disabled={saving} />
            </div>
            <label>Hình thức
              <Select
                value={form.payment_method}
                options={[
                  { value: 'CASH', label: 'Tiền mặt' },
                  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
                ]}
                onChange={(value) => setForm({ ...form, payment_method: value })}
                className="ui-select--field"
              />
            </label>
            <label>Ghi chú
              <input className="form-control" value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            {Number(form.amount) > recordingRow.remaining && (
              <p className="debt__warn"><AlertTriangle size={14} /> Vượt quá số còn thiếu.</p>
            )}
            <div className="debt__form-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setRecordingRow(null); setReceiptFiles([]) }}>Huỷ</button>
              <button type="button" className="btn btn-primary"
                disabled={saving || !form.amount || Number(form.amount) <= 0
                  || Number(form.amount) > recordingRow.remaining || receiptFiles.length === 0}
                onClick={handleRecordPayment}>
                {saving ? 'Đang lưu…' : 'Ghi nhận'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sensitive Action Modal for Debt Write-Off */}
      <SensitiveActionModal
        isOpen={Boolean(writingOffRow)}
        onClose={() => setWritingOffRow(null)}
        onConfirm={handleWriteOffDebt}
        title={`Xóa nợ / Miễn giảm công nợ HĐ ${writingOffRow?.contract_id} (Giám Đốc)`}
        description={`Xác nhận miễn giảm ${formatMoney(writingOffRow?.remaining)} còn lại cho khách hàng ${writingOffRow?.customer_name}. Hợp đồng sẽ chuyển sang trạng thái Đã xóa nợ (written_off).`}
        actionLabel="Xác nhận xóa nợ"
        actionVariant="purple"
        requireReason={true}
        placeholderReason="Nhập lý do xóa nợ / miễn giảm cho khách hàng (*)..."
        isLoading={saving}
      />

      {/* Modal Chuyển Nợ Sang Hợp Đồng Mới (Giám Đốc) */}
      <Modal open={Boolean(transferringRow)} onClose={() => setTransferringRow(null)} title="Chuyển nợ sang Hợp đồng mới (Giám Đốc)">
        {transferringRow && (
          <div className="debt__form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Thẻ tóm tắt HĐ Nguồn */}
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>HỢP ĐỒNG NGUỒN (CHUYỂN ĐI):</span>
                <span style={{
                  background: '#fee2e2',
                  color: '#dc2626',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  padding: '2px 8px',
                  borderRadius: 6
                }}>
                  Nợ {formatMoney(transferringRow.remaining)}
                </span>
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                {transferringRow.contract_id} · <span style={{ color: '#2563eb' }}>{transferringRow.customer_name}</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Dịch vụ: {transferringRow.service_type || 'Đo đạc / Pháp lý'} · Tổng giá trị: {formatMoney(transferringRow.total_value)}
              </div>
            </div>

            {/* Chọn Hợp đồng nhận nợ */}
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 6 }}>
                HỢP ĐỒNG NHẬN NỢ (CÙNG KHÁCH HÀNG <span style={{ color: '#2563eb' }}>{transferringRow.customer_name}</span>) <span className="debt__req">*</span>
              </label>

              {loadingTargets ? (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}>
                  <RefreshCw size={16} className="animate-spin" /> Đang tìm kiếm các hợp đồng khác của khách hàng...
                </div>
              ) : eligibleTargets.length === 0 ? (
                <div style={{
                  background: '#fffbeb',
                  border: '1.5px solid #fef3c7',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12
                }}>
                  <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: '#92400e', fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>
                      Khách hàng chưa có hợp đồng nào khác để nhận nợ
                    </strong>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#b45309', lineHeight: 1.5 }}>
                      Khách hàng <strong>{transferringRow.customer_name}</strong> hiện chưa có hợp đồng nào khác đang hoạt động trong hệ thống.
                      Vui lòng tạo Hợp đồng mới cho khách hàng này tại phân hệ <strong>Hợp Đồng</strong> trước khi thực hiện chuyển gộp nợ.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Select
                    value={targetContractId}
                    options={[
                      { value: '', label: `-- Chọn hợp đồng nhận nợ (${eligibleTargets.length} hợp đồng khả dụng) --` },
                      ...eligibleTargets.map((t) => ({
                        value: t.id,
                        label: `${t.id} — ${t.service_type} (Tổng: ${formatMoney(t.total_value)} | Nợ hiện tại: ${formatMoney(t.remaining_amount)})`
                      }))
                    ]}
                    onChange={(value) => setTargetContractId(value)}
                    className="ui-select--field"
                  />

                  {/* Thẻ xem trước kết quả gộp nợ */}
                  {selectedTarget && (
                    <div style={{
                      marginTop: 10,
                      background: '#f0fdf4',
                      border: '1.5px solid #bbf7d0',
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>DỰ KIẾN SAU KHI GỘP NỢ:</div>
                        <div style={{ fontSize: '0.85rem', color: '#14532d', marginTop: 2 }}>
                          HĐ <strong>{selectedTarget.id}</strong> (Nợ cũ: {formatMoney(selectedTarget.remaining_amount)}) + Nợ chuyển sang ({formatMoney(transferringRow.remaining)})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#166534' }}>TỔNG NỢ MỚI</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803d' }}>
                          {formatMoney(Number(selectedTarget.remaining_amount || 0) + Number(transferringRow.remaining || 0))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lý do chuyển nợ */}
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 6 }}>
                LÝ DO CHUYỂN NỢ (GIÁM ĐỐC PHÊ DUYỆT) <span className="debt__req">*</span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Nhập lý do chuyển nợ gộp sang hợp đồng mới (VD: Khách hàng yêu cầu thanh toán gộp vào đợt 2 của HĐ mới)..."
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Footer */}
            <div className="debt__form-footer" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTransferringRow(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !targetContractId || !transferReason.trim() || loadingTargets || eligibleTargets.length === 0}
                onClick={handleCarryForwardDebt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {saving ? 'Đang chuyển nợ…' : <><ArrowRightLeft size={15} /> Xác nhận chuyển nợ</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
