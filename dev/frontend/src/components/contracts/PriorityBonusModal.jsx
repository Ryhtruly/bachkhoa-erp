import React, { useEffect, useState } from 'react';
import { Sparkles, LoaderCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { apiFetch } from '../../lib/api';

const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
const NHAN_UT = { HIGH: 'Ưu tiên cao', URGENT: 'Gấp' };

/**
 * Phân bổ thưởng ưu tiên khi hoàn thành hợp đồng (GĐ3, Q6/Q7).
 * Hệ thống gợi ý = khoán × (hệ số − 1); giám đốc sửa số cuối rồi chốt.
 */
export default function PriorityBonusModal({ open, contractId, onClose, onDone, addToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [amounts, setAmounts] = useState({});   // employee_id -> số tiền

  useEffect(() => {
    if (!open || !contractId) return;
    setLoading(true);
    apiFetch(`/api/contracts/${encodeURIComponent(contractId)}/priority-bonus/preview`)
      .then((res) => {
        const d = res?.data;
        setData(d);
        const init = {};
        (d?.participants || []).forEach((p) => { init[p.employee_id] = p.already_paid ? '' : String(p.suggested_bonus || 0); });
        setAmounts(init);
      })
      .catch((e) => addToast?.(e.message || 'Lỗi tải thưởng', 'error'))
      .finally(() => setLoading(false));
  }, [open, contractId, addToast]);

  const chot = async () => {
    const allocations = (data?.participants || [])
      .filter((p) => !p.already_paid && Number(amounts[p.employee_id]) > 0)
      .map((p) => ({ employee_id: p.employee_id, amount: Number(amounts[p.employee_id]) }));
    if (!allocations.length) { addToast?.('Chưa nhập khoản thưởng nào', 'error'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/contracts/${encodeURIComponent(contractId)}/priority-bonus`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations }),
      });
      addToast?.(`Đã chốt thưởng cho ${res?.data?.created || 0} người`, 'success');
      onDone?.();
      onClose?.();
    } catch (e) {
      addToast?.(e.message || 'Lỗi chốt thưởng', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose?.()} size="md" closeOnOverlay={!saving}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} color="#f59e0b" /> Thưởng ưu tiên · {contractId}</span>}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-primary" disabled={saving || loading} onClick={chot}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Chốt & ghi vào lương
          </button>
        </>
      )}>
      {loading ? (
        <p style={{ padding: 12 }}><LoaderCircle size={16} className="spin" /> Đang tải…</p>
      ) : !data ? null : data.priority === 'NORMAL' ? (
        <p style={{ margin: 0 }}>Hợp đồng này không đặt ưu tiên nên không có thưởng.</p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
            Mức <strong>{NHAN_UT[data.priority] || data.priority}</strong> · hệ số gợi ý <strong>×{data.multiplier}</strong>.
            Thưởng gợi ý = khoán × (hệ số − 1); giám đốc sửa số cuối.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1.5px solid #e2e8f0' }}>
                <th style={{ padding: '6px 4px' }}>Nhân viên</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Khoán đã nhận</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Thưởng</th>
              </tr>
            </thead>
            <tbody>
              {data.participants.map((p) => (
                <tr key={p.employee_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 4px' }}>{p.full_name}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: '#475569' }}>{tien(p.khoan)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                    {p.already_paid ? (
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>Đã thưởng</span>
                    ) : (
                      <input type="number" min="0" step="10000" value={amounts[p.employee_id] ?? ''}
                        onChange={(e) => setAmounts((cur) => ({ ...cur, [p.employee_id]: e.target.value }))}
                        style={{ width: 130, textAlign: 'right', height: 34, border: '1.5px solid #cbd5e1', borderRadius: 7, padding: '0 8px', fontWeight: 700, color: '#f59e0b' }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.participants.length === 0 && <p style={{ color: '#94a3b8', marginTop: 10 }}>Chưa ai nhận khoán trên hợp đồng này.</p>}
        </>
      )}
    </Modal>
  );
}
