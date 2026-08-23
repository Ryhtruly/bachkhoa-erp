import React, { useState, useEffect, useRef } from 'react';
import { ConfirmationModal, DatePicker, Modal, Select, SensitiveActionModal } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { AlertCircle, Check, X, Trash2, Printer } from 'lucide-react';
import { parseAmt, spellVietnameseCurrency } from '../utils';
import { apiFetch } from '../../../lib/api';
import { API } from '../financeConstants';
import { VoucherTemplate } from '../screens/PrintVoucherScreen';
import { printElement } from '../print/printDocument';
import voucherPrintStyles from '../screens/PrintVoucherScreen.print.css?inline';

function CashflowDetailModal({ open, transactionId, isDirector: propIsDirector, user: propUser, onClose, onSuccess }) {
  const printDocumentRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    category: '',
    payer_payee: '',
    payment_method: 'CASH',
    amount: '',
    transaction_date: '',
    description: '',
    contract_id: ''
  });
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [autofillNotice, setAutofillNotice] = useState('');
  const [sensitiveModal, setSensitiveModal] = useState(null); // null | 'discard' | 'reject' | 'void'
  const [currentUser, setCurrentUser] = useState(propUser || null);
  const { addToast } = useToast();

  useEffect(() => {
    if (propIsDirector === undefined && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {});
    }
  }, [propIsDirector, propUser]);

  const isDirector = propIsDirector !== undefined
    ? propIsDirector
    : Boolean(
        currentUser?.is_director ||
        currentUser?.username === 'admin' ||
        currentUser?.role_name === 'admin' ||
        currentUser?.permissions?.some(p => (p.resource === 'finance' || p.resource === '*') && (p.action === 'delete' || p.action === 'approve' || p.action === '*'))
      );

  const isPending = detail?.status === 'PENDING' || detail?.status === 'Chờ duyệt' || detail?.status === 'pending';
  const isReadOnly = detail?.status === 'COMPLETED' || detail?.status === 'Hoàn thành' || detail?.status === 'Đã duyệt' || detail?.status === 'Đã quyết toán' || detail?.status === 'CANCELLED' || detail?.status === 'Đã hủy' || detail?.status === 'REJECTED' || detail?.status === 'Từ chối';

  useEffect(() => {
    if (open && transactionId) {
      setLoading(true);
      setError('');
      setDirty(false);
      setAutofillNotice('');

      // Load transaction details
      apiFetch(`${API}/api/finance/cashflow/${transactionId}`)
        .then(d => {
          setDetail(d);
          let parsedDate = d.date || d.transaction_date;
          if (parsedDate && parsedDate.includes('/')) {
            const [dd, mm, yy] = parsedDate.split('/');
            parsedDate = `20${yy}-${mm}-${dd}`;
          }
          let pm = d.payment_method || 'CASH';
          if (pm === 'Tiền mặt') pm = 'CASH';
          if (pm === 'Chuyển khoản') pm = 'BANK_TRANSFER';
          setForm({
            category: d.category || '',
            payer_payee: d.partner || d.payer_payee || d.payer_payee_name || '',
            payment_method: pm,
            amount: String(d.amount || ''),
            transaction_date: parsedDate || '',
            description: d.description || '',
            contract_id: d.contract_id || ''
          });
          setLoading(false);
        })
        .catch(() => {
          setError('Không thể tải dữ liệu phiếu');
          setLoading(false);
        });

      // Load contracts
      apiFetch(`${API}/api/finance/contracts`)
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [open, transactionId]);

  const handleContractChange = (cid) => {
    setDirty(true);

    if (!cid) {
      setForm(prev => ({ ...prev, contract_id: '' }));
      setAutofillNotice('');
      return;
    }

    const matched = contracts.find(c => c.id === cid);
    if (!matched) {
      setForm(prev => ({ ...prev, contract_id: cid }));
      return;
    }

    setForm(prev => ({
      ...prev,
      contract_id: cid,
      payer_payee: matched.customer_name || prev.payer_payee,
      description: prev.description || `Thu tiền đợt HĐ ${cid} - ${matched.customer_name || ''}`
    }));
    setAutofillNotice(`Đã tự điền khách hàng "${matched.customer_name}" từ HĐ ${cid}`);
  };

  const handleChange = (field, val) => {
    setDirty(true);
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleClose = () => {
    if (sensitiveModal) return;
    if (dirty) {
      setSensitiveModal('discard');
      return;
    }
    onClose();
  };

  const discardChanges = () => {
    setDirty(false);
    setSensitiveModal(null);
    onClose();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const amountVal = parseAmt(form.amount);
    if (!amountVal) {
      setError('Nhập số tiền hợp lệ');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        category: form.category,
        payer_payee: form.payer_payee,
        payment_method: form.payment_method,
        amount: amountVal,
        transaction_date: form.transaction_date,
        description: form.description,
        contract_id: form.contract_id || null
      };

      await apiFetch(`${API}/api/finance/cashflow/${transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      addToast(`Đã lưu thay đổi phiếu ${transactionId}`, 'success');
      setDirty(false);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`${API}/api/finance/cashflow/${transactionId}/approve`, { method: 'POST' });
      addToast(`Giám đốc đã phê duyệt phiếu ${transactionId}`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi phê duyệt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (reason) => {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`${API}/api/finance/cashflow/${transactionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      addToast(`Đã từ chối phiếu ${transactionId}`, 'info');
      setSensitiveModal(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi từ chối phiếu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (reason) => {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`${API}/api/finance/cashflow/${transactionId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      addToast(`Đã hủy phiếu ${transactionId}`, 'warning');
      setSensitiveModal(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi hủy phiếu');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const isIncomeTransaction = detail?.type === 'INCOME' || detail?.type === 'Thu' || detail?.transaction_type === 'INCOME' || detail?.transaction_type === 'Thu';
  const isReversal = Boolean(
    (detail?.category || '').toLowerCase().includes('hoàn tác') ||
    (detail?.category || '').toLowerCase().includes('hủy phiếu') ||
    (detail?.description || '').toLowerCase().includes('hủy tự động cho phiếu gốc')
  );
  const accent = isIncomeTransaction ? '#10b981' : '#ef4444';
  const brandAccent = '#eb4a23';
  const transactionType = detail?.type || detail?.transaction_type;
  const isAdvance = transactionType === 'ADVANCE' || transactionType === 'Tạm ứng';
  const isReimbursement = transactionType === 'REIMBURSEMENT' || transactionType === 'Hoàn ứng';
  const voucherTitle = isIncomeTransaction
    ? 'PHIẾU THU'
    : isAdvance
      ? 'PHIẾU CHI TẠM ỨNG'
      : isReimbursement
        ? 'PHIẾU QUYẾT TOÁN HOÀN ỨNG'
        : 'PHIẾU CHI';

  const handlePrintVoucher = () => {
    printElement({
      element: printDocumentRef.current,
      title: `${voucherTitle} ${transactionId || ''}`.trim(),
      styles: voucherPrintStyles,
      onError: message => addToast(message, 'error'),
    });
  };

  return (
    <>
      <Modal open={open} onClose={handleClose} size="lg" hideClose={true} closeOnOverlay={!dirty}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải...</div>
        ) : (
          <form onSubmit={handleSave}>
            <table className="excel-grid-table">
              <tbody>
                <tr>
                  <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
                      <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
                    </div>
                  </td>
                  <td colSpan={2} style={{ textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', textTransform: 'uppercase', color: accent }}>
                      PHIẾU {isIncomeTransaction ? 'THU TIỀN' : 'CHI TIỀN'}
                    </h2>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Số: <strong style={{ fontFamily: 'monospace' }}>{transactionId}</strong>
                    </div>
                    {isPending && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge--warning">Chờ Giám đốc duyệt</span>
                      </div>
                    )}
                  </td>
                </tr>

                <tr>
                  <td style={{ width: '15%', fontWeight: 'bold' }}>Họ tên đối tác</td>
                  <td style={{ width: '35%' }}>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={form.payer_payee}
                      onChange={e => handleChange('payer_payee', e.target.value)}
                      placeholder="Người nộp / nhận tiền..."
                      required
                    />
                    {autofillNotice && (
                      <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: 2 }}>{autofillNotice}</div>
                    )}
                  </td>
                  <td style={{ width: '15%', fontWeight: 'bold' }}>Ngày lập</td>
                  <td style={{ width: '35%' }}>
                    <DatePicker
                      disabled={isReadOnly}
                      value={form.transaction_date}
                      onChange={value => handleChange('transaction_date', value)}
                      placeholder="Chọn ngày lập"
                      clearable={!isReadOnly}
                      className="date-picker--fill"
                    />
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Danh mục</td>
                  <td>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={form.category}
                      onChange={e => handleChange('category', e.target.value)}
                      placeholder="Lý do thu / chi..."
                      required
                    />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Hình thức</td>
                  <td>
                    <Select
                      disabled={isReadOnly}
                      value={form.payment_method}
                      options={[
                        { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
                        { value: 'CASH', label: 'Tiền mặt' },
                      ]}
                      onChange={value => handleChange('payment_method', value)}
                      placeholder="— Chọn hình thức —"
                      className="ui-select--field"
                    />
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
                  <td>
                    <input type="text" disabled value={detail?.department_code || 'Kế toán'} placeholder="Kế toán, Kỹ thuật, Công trường..." />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Số tiền</td>
                  <td>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={form.amount ? Number(form.amount).toLocaleString('vi-VN') : ''}
                      onChange={e => handleChange('amount', e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                      style={{ fontWeight: 'bold', textAlign: 'right', color: accent, fontSize: '1.1rem' }}
                      required
                    />
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Trạng thái</td>
                  <td>
                    <input type="text" disabled value={detail?.status_label || detail?.status || 'Hoàn thành'} />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Liên kết</td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <input
                        type="text"
                        list="detail-contract-datalist"
                        placeholder="Gõ hoặc chọn Mã HĐ..."
                        value={form.contract_id || ''}
                        onChange={(e) => handleContractChange(e.target.value)}
                        style={{ fontSize: '0.8rem', width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                      <datalist id="detail-contract-datalist">
                        {contracts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.id} — {c.customer_name} ({c.service_type || 'HĐ'})
                          </option>
                        ))}
                      </datalist>
                      {form.contract_id && contracts.length > 0 && !contracts.some(c => c.id === form.contract_id) && (
                        <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 2 }}>
                          ⚠️ Mã HĐ chưa có trong danh mục
                        </div>
                      )}
                    </div>
                  </td>
                </tr>

                <tr>
                  <td colSpan={4} style={{ padding: '10px' }}>
                    <span style={{ fontWeight: 'bold' }}>Số tiền (bằng chữ): </span>
                    <i style={{ color: 'var(--text-secondary)' }}>
                      {form.amount ? spellVietnameseCurrency(form.amount) : 'Không đồng'}
                    </i>
                  </td>
                </tr>
              </tbody>
            </table>

            {isReadOnly && !isPending && (
              <div style={{
                marginTop: 16,
                padding: '10px 14px',
                background: isReversal ? 'rgba(100,116,139,0.12)' : (detail?.status === 'REJECTED' || detail?.status === 'Từ chối') ? 'rgba(239,68,68,0.12)' : (detail?.status === 'CANCELLED' || detail?.status === 'Đã hủy') ? 'rgba(100,116,139,0.12)' : 'rgba(245,158,11,0.12)',
                border: `1px solid ${isReversal ? 'rgba(100,116,139,0.3)' : (detail?.status === 'REJECTED' || detail?.status === 'Từ chối') ? 'rgba(239,68,68,0.3)' : (detail?.status === 'CANCELLED' || detail?.status === 'Đã hủy') ? 'rgba(100,116,139,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: 8,
                fontSize: '0.82rem',
                color: isReversal ? 'var(--text-secondary)' : (detail?.status === 'REJECTED' || detail?.status === 'Từ chối') ? '#f87171' : (detail?.status === 'CANCELLED' || detail?.status === 'Đã hủy') ? 'var(--text-secondary)' : '#fbbf24'
              }}>
                {isReversal
                  ? 'Chứng từ hoàn tác (Bút toán đảo đối ứng). Chứng từ này được khóa cố định để đảm bảo tính toàn vẹn sổ quỹ và đối soát kiểm toán.'
                  : (detail?.status === 'REJECTED' || detail?.status === 'Từ chối')
                    ? `Phiếu đã bị Giám đốc từ chối${detail?.cancellation_reason ? `: "${detail.cancellation_reason}"` : ''}. Không phát sinh thu chi trên sổ quỹ.`
                    : (detail?.status === 'CANCELLED' || detail?.status === 'Đã hủy')
                      ? `Phiếu đã bị hủy bỏ${detail?.cancellation_reason ? `: "${detail.cancellation_reason}"` : ''}. Số tiền không tính vào sổ quỹ.`
                      : `Phiếu đã hoàn thành (${detail?.status_label || detail?.status}). Chỉ cho phép chỉnh sửa liên kết hợp đồng.`}
              </div>
            )}

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePrintVoucher}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={15} /> In phiếu
                </button>
                {(detail?.status === 'COMPLETED' || detail?.status === 'Hoàn thành') && !isReversal && isDirector && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setSensitiveModal('void')}
                    disabled={submitting}
                    style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Chỉ Giám đốc/Admin có quyền hủy bỏ chứng từ đã hoàn thành"
                  >
                    <Trash2 size={14} /> Hủy phiếu
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary" onClick={handleClose}>Đóng</button>

                {/* Nút lưu thay đổi: CHỈ hiển thị khi người dùng thực sự có chỉnh sửa (dirty) */}
                {dirty && (
                  <button
                    type="submit"
                    className="btn"
                    disabled={submitting}
                    style={{ background: brandAccent, color: '#fff', padding: '0 20px', fontWeight: 600 }}
                  >
                    {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                )}

                {/* Nút Duyệt / Từ chối cho Giám đốc khi phiếu đang chờ duyệt */}
                {isPending && isDirector && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setSensitiveModal('reject')}
                      disabled={submitting}
                      style={{ padding: '0 18px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <X size={15} /> Từ chối
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleApprove}
                      disabled={submitting}
                      style={{ background: '#10b981', borderColor: '#10b981', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                    >
                      <Check size={16} /> Duyệt phiếu
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>
        )}
      </Modal>

      {detail && (
        <div aria-hidden="true" style={{ position: 'fixed', left: '-100000px', top: 0, width: '186mm', pointerEvents: 'none' }}>
          <VoucherTemplate
            title={voucherTitle}
            voucherId={transactionId || detail.id}
            date={form.transaction_date}
            personName={form.payer_payee}
            labelPerson={isIncomeTransaction ? 'Người nộp tiền' : 'Người nhận tiền'}
            description={form.description}
            amount={form.amount}
            amountWords={form.amount ? spellVietnameseCurrency(form.amount) : ''}
            category={form.category}
            paymentMethod={form.payment_method}
            department={detail.department_code}
            contractId={form.contract_id}
            projectId={detail.project_id}
            accounting={detail.accounting || detail.accounting_name}
            documentRef={printDocumentRef}
          />
        </div>
      )}

      <ConfirmationModal
        open={sensitiveModal === 'discard'}
        onClose={() => setSensitiveModal(null)}
        onConfirm={discardChanges}
        title="Bỏ các thay đổi chưa lưu?"
        description="Những nội dung bạn vừa chỉnh sửa trên phiếu sẽ không được lưu lại."
        confirmLabel="Bỏ thay đổi"
        variant="danger"
      />

      {/* Sensitive Action Modal for Reject */}
      <SensitiveActionModal
        isOpen={sensitiveModal === 'reject'}
        onClose={() => setSensitiveModal(null)}
        onConfirm={handleReject}
        title="Từ chối phê duyệt phiếu thu chi"
        description={`Bạn đang từ chối duyệt phiếu ${transactionId} số tiền ${Number(detail?.amount || 0).toLocaleString('vi-VN')}đ.`}
        actionLabel="Từ chối phiếu"
        actionVariant="danger"
        requireReason={true}
        placeholderReason="Nhập lý do từ chối phê duyệt phiếu này..."
        isLoading={submitting}
      />

      {/* Sensitive Action Modal for Void */}
      <SensitiveActionModal
        isOpen={sensitiveModal === 'void'}
        onClose={() => setSensitiveModal(null)}
        onConfirm={handleVoid}
        title="Hủy bỏ chứng từ thu chi đã hoàn thành"
        description={`Phiếu ${transactionId} sẽ bị hủy và số tiền ${Number(detail?.amount || 0).toLocaleString('vi-VN')}đ sẽ được đảo ngược khỏi công nợ & số dư quỹ.`}
        actionLabel="Xác nhận hủy phiếu"
        actionVariant="danger"
        requireReason={true}
        placeholderReason="Nhập lý do hủy bỏ chứng từ này..."
        isLoading={submitting}
      />
    </>
  );
}

export default CashflowDetailModal;
