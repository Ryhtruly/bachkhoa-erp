import React, { useState, useEffect } from 'react';
import { Modal, FormRow, FormGrid, Dropdown } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { AlertCircle, Link } from 'lucide-react';
import { API } from '../financeConstants';
import { parseAmt, docSoTiengViet } from '../utils';

function CashflowDetailModal({ open, transactionId, onClose, onSuccess }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    hang_muc: '',
    nguoi_nhan_nop: '',
    hinh_thuc: 'Tiền mặt',
    so_tien: '',
    ngay: '',
    dien_giai: '',
    contract_id: ''
  });
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [autofillNotice, setAutofillNotice] = useState('');
  const { addToast } = useToast();

  const isReadOnly = detail?.trang_thai === 'Hoàn thành' || detail?.trang_thai === 'Đã duyệt';

  useEffect(() => {
    if (open && transactionId) {
      setLoading(true);
      setError('');
      setDirty(false);
      setAutofillNotice('');

      // Load transaction details
      fetch(`${API}/api/finance/cashflow/${transactionId}`)
        .then(r => r.json())
        .then(d => {
          setDetail(d);
          let parsedDate = d.ngay;
          if (parsedDate && parsedDate.includes('/')) {
            const [dd, mm, yy] = parsedDate.split('/');
            parsedDate = `20${yy}-${mm}-${dd}`;
          }
          setForm({
            hang_muc: d['Hạng mục'] || '',
            nguoi_nhan_nop: d['Đối tác'] || '',
            hinh_thuc: d['Hình thức'] || 'Tiền mặt',
            so_tien: String(d.amount || ''),
            ngay: parsedDate || '',
            dien_giai: d['Diễn giải'] || '',
            contract_id: d.contract_id || ''
          });
          setLoading(false);
        })
        .catch(() => {
          setError('Không thể tải dữ liệu phiếu');
          setLoading(false);
        });

      // Load contracts
      fetch(`${API}/api/finance/contracts`)
        .then(r => r.json())
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [open, transactionId]);

  const handleContractChange = (cid) => {
    setDirty(true);

    let newPayer = form.nguoi_nhan_nop;
    let notice = '';

    if (cid) {
      const c = contracts.find(x => x.id === cid);
      if (c && c.customer_name) {
        if (!form.nguoi_nhan_nop) {
          newPayer = c.customer_name;
        } else if (form.nguoi_nhan_nop !== c.customer_name) {
          newPayer = c.customer_name;
          notice = 'Đã tự điền theo hồ sơ — bạn có thể chỉnh lại';
        }
      }
    }

    setAutofillNotice(notice);
    setForm(prev => ({ ...prev, contract_id: cid, nguoi_nhan_nop: newPayer }));
  };

  const handleChange = (field, val) => {
    setDirty(true);
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Thoát mà không lưu?')) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(form.so_tien);
    if (!isReadOnly && !amount) { setError('Nhập số tiền hợp lệ'); return; }

    setSubmitting(true); setError('');
    try {
      const payload = {
        hang_muc: form.hang_muc,
        nguoi_nhan_nop: form.nguoi_nhan_nop,
        hinh_thuc: form.hinh_thuc,
        so_tien: amount,
        ngay: form.ngay,
        dien_giai: form.dien_giai,
        contract_id: form.contract_id || null
      };

      const res = await fetch(`${API}/api/finance/cashflow/${transactionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        addToast(`✅ Đã lưu thay đổi phiếu ${transactionId}`, 'success');
        setDirty(false);
        onSuccess?.();
        onClose();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const isThu = detail?.type === 'Thu';
  const accent = isThu ? '#10b981' : '#ef4444';
  const brandAccent = '#eb4a23';
  const selectedContract = form.contract_id ? contracts.find(c => c.id === form.contract_id) || detail?.contract_info : null;

  return (
    <Modal open={open} onClose={handleClose} size="lg" hideClose={true} closeOnOverlay={!dirty}>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <table className="excel-grid-table">
            <tbody>
              <tr>
                <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
                    <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
                  </div>
                </td>
                <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: accent }}>
                    {isThu ? 'PHIẾU THU' : 'PHIẾU CHI'}
                  </h2>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
                    <span>Ngày in: {new Date().toLocaleDateString('vi-VN')}</span>
                    <span>Giờ: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
                <td style={{ width: '35%' }}>
                  <input type="text" readOnly value={transactionId || ''} style={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
                </td>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Ngày</td>
                <td style={{ width: '35%' }}>
                  <input type="date" disabled={isReadOnly} value={form.ngay} onChange={e => handleChange('ngay', e.target.value)} style={{ fontFamily: 'monospace' }} required />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.dien_giai} onChange={e => handleChange('dien_giai', e.target.value)} placeholder="Nhập diễn giải chi tiết..." required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.hang_muc} onChange={e => handleChange('hang_muc', e.target.value)} required />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>{isThu ? 'Người nộp' : 'Người nhận'}</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.nguoi_nhan_nop} onChange={e => handleChange('nguoi_nhan_nop', e.target.value)} placeholder={isThu ? 'Họ tên người nộp tiền...' : 'Họ tên người nhận tiền...'} required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hình thức</td>
                <td>
                  <select disabled={isReadOnly} value={form.hinh_thuc} onChange={e => handleChange('hinh_thuc', e.target.value)}>
                    <option value="Chuyển khoản">🏦 Chuyển khoản</option>
                    <option value="Tiền mặt">💵 Tiền mặt</option>
                  </select>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
                <td>
                  <input type="text" disabled value={detail?.du_an_phong_ban || 'Kế toán'} placeholder="Kế toán, Kỹ thuật, Công trường..." />
                </td>
                <td style={{ fontWeight: 'bold' }}>Số tiền</td>
                <td>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={form.so_tien ? Number(form.so_tien).toLocaleString('vi-VN') : ''}
                    onChange={e => handleChange('so_tien', e.target.value.replace(/[^\d]/g, ''))}
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
                    {form.so_tien ? docSoTiengViet(form.so_tien) : 'Không đồng'}
                  </i>
                </td>
              </tr>
            </tbody>
          </table>

          {isReadOnly && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f59e0b' }}>
              ⚠️ Phiếu đã duyệt/hoàn thành. Chỉ cho phép chỉnh sửa liên kết hồ sơ.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Hủy bỏ</button>
            <button type="submit" className="btn" disabled={submitting || (!dirty && !isReadOnly)}
              style={{ background: brandAccent, color: '#fff', padding: '0 24px', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '⏳ Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default CashflowDetailModal;
