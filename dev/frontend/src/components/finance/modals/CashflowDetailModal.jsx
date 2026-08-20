import React, { useState, useEffect, useRef } from 'react';
import { ConfirmationModal, DatePicker, Modal, FormRow, FormGrid, Dropdown, SensitiveActionModal, Badge } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { AlertCircle, Link, Check, X, ShieldAlert, Trash2, Printer } from 'lucide-react';
import { parseAmt, spellVietnameseCurrency } from '../utils';
import { apiFetch } from '../../../lib/api';
import { VoucherTemplate } from '../screens/PrintVoucherScreen';
import { printElement } from '../print/printDocument';
import voucherPrintStyles from '../screens/PrintVoucherScreen.print.css?inline';

function CashflowDetailModal({ open, transactionId, isDirector: propIsDirector, user: propUser, onClose, onSuccess }) {
  const printDocumentRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    category: '',
    payer_payee: '',
    payment_method: 'Tiền mặt',
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

  const isPending = detail?.status === 'Chờ duyệt';
  const isReadOnly = detail?.status === 'Hoàn thành' || detail?.status === 'Đã duyệt' || detail?.status === 'Đã quyết toán' || detail?.status === 'Đã hủy' || detail?.status === 'Từ chối';

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
          setForm({
            category: d.category || '',
            payer_payee: d.partner || d.payer_payee || d.payer_payee_name || '',
            payment_method: d.payment_method || 'Tiền mặt',
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

  const isIncomeTransaction = detail?.type === 'Thu' || detail?.transaction_type === 'Thu';
  const accent = isIncomeTransaction ? '#10b981' : '#ef4444';
  const brandAccent = '#eb4a23';
  const transactionType = detail?.type || detail?.transaction_type;
  const voucherTitle = isIncomeTransaction
    ? 'PHIẾU THU'
    : transactionType === 'Tạm ứng'
      ? 'PHIẾU CHI TẠM ỨNG'
      : transactionType === 'Hoàn ứng'
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
                    <select
                      disabled={isReadOnly}
                      value={form.payment_method}
                      onChange={e => handleChange('payment_method', e.target.value)}
                    >
                      <option value="Chuyển khoản">Chuyển khoản</option>
                      <option value="Tiền mặt">Tiền mặt</option>
                    </select>
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
                    <input type="text" disabled value={detail?.status || 'Hoàn thành'} />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Liên kết</td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="text" placeholder="Nhập ID hợp đồng..." value={form.contract_id || ''} onChange={(e) => handleContractChange(e.target.value)} style={{ fontSize: '0.75rem', width: '100%', padding: '4px' }} />
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
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f59e0b' }}>
                Phiếu đã duyệt/hoàn thành ({detail?.status}). Chỉ cho phép chỉnh sửa liên kết hồ sơ.
              </div>
            )}

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 24, paddingTop: 20 }}>
              <div>
                {detail?.status === 'Hoàn thành' && isDirector && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setSensitiveModal('void')}
                    disabled={submitting}
                    style={{ fontSize: '0.82rem' }}
                    title="Chỉ Giám đốc/Admin có quyền hủy bỏ chứng từ đã hoàn thành"
                  >
                    <Trash2 size={14} /> Hủy phiếu này
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePrintVoucher}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={15} /> In phiếu
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleClose}>Đóng</button>

                {isPending && isDirector && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setSensitiveModal('reject')}
                      disabled={submitting}
                      style={{ padding: '0 18px' }}
                    >
                      <X size={15} /> Từ chối
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleApprove}
                      disabled={submitting}
                      style={{ background: '#10b981', borderColor: '#10b981', padding: '0 20px' }}
                    >
                      <Check size={15} /> Duyệt phiếu (Giám đốc)
                    </button>
                  </>
                )}

                {!isPending && !isReadOnly && (
                  <button type="submit" className="btn" disabled={submitting || !dirty}
                    style={{ background: brandAccent, color: '#fff', padding: '0 24px', opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
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
