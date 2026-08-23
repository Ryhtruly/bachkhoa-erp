import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { Modal, FormRow, FormGrid, Dropdown } from '../../ui';
import { parseAmt, CATEGORY_AUTO_MAPPING, fmtAmt } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import { AlertCircle, PlusCircle, MinusCircle } from 'lucide-react';

const INCOME_CATEGORIES = [
  { value: "Thu lãi tiền gửi ngân hàng", label: "Thu lãi tiền gửi ngân hàng" },
  { value: "Thu hoàn tiền tạm ứng thừa", label: "Thu hoàn tiền tạm ứng thừa" },
  { value: "Thu thanh lý tài sản & phế liệu", label: "Thu thanh lý tài sản & phế liệu" },
  { value: "Thu bồi thường / Phạt vi phạm HĐ", label: "Thu bồi thường / Phạt vi phạm HĐ đối tác" },
  { value: "Thu góp vốn / Vay mượn kinh doanh", label: "Thu góp vốn / Vay mượn kinh doanh" },
  { value: "Thu chênh lệch kiểm kê quỹ", label: "Thu chênh lệch kiểm kê quỹ" },
  { value: "Khác", label: "Thu khác (Tự nhập)" }
];

const EXPENSE_CATEGORIES = [
  { value: "Chi tiếp khách & Giao tế", label: "Chi tiếp khách & Giao tế đối tác" },
  { value: "Chi ngoại giao & Xử lý hồ sơ", label: "Chi ngoại giao & Xử lý hồ sơ" },
  { value: "Bồi dưỡng thẩm định & Hiện trường", label: "Bồi dưỡng thẩm định & Dẫn mốc hiện trường" },
  { value: "Chi thụ lý bản vẽ & Trích lục", label: "Chi thụ lý bản vẽ & Lấy trích lục" },
  { value: "Công chứng, Lệ phí & Nghĩa vụ thuế", label: "Công chứng, Lệ phí & Đóng thuế" },
  { value: "Lương khoán & Hoa hồng 3P", label: "Lương khoán tổ đo vẽ & Hoa hồng" },
  { value: "Công tác phí & Di chuyển hiện trường", label: "Công tác phí, Xăng xe & Di chuyển" },
  { value: "Văn phòng phẩm & In ấn kỹ thuật", label: "Văn phòng phẩm & In ấn bản đồ" },
  { value: "Sửa chữa, Kiểm định máy đo & Thiết bị", label: "Kiểm định máy đo RTK & Bảo trì thiết bị" },
  { value: "Điện - Nước - Internet", label: "Điện - Nước - Internet" },
  { value: "Chi quầy tiếp nhận & Vệ sinh", label: "Chi quầy tiếp nhận & Vệ sinh" },
  { value: "Chi hoàn trả khách hàng", label: "Chi hoàn trả khách hàng (nộp thừa / hoàn cọc)" },
  { value: "Chi bảo vệ", label: "Chi bảo vệ" },
  { value: "Sinh hoạt gia đình", label: "Sinh hoạt gia đình (Rút vốn)" },
  { value: "Chi chênh lệch kiểm kê quỹ", label: "Chi chênh lệch kiểm kê quỹ" },
  { value: "Khác", label: "Chi khác (Tự nhập)" }
];

export default function CashflowModal({ open, onClose, defaultType = 'Thu', onSuccess, user: propUser }) {
  const [currentUser, setCurrentUser] = useState(propUser || null);

  useEffect(() => {
    if (open && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {});
    } else if (propUser) {
      setCurrentUser(propUser);
    }
  }, [open, propUser]);

  const creatorName = currentUser?.full_name || currentUser?.username || 'Kế toán';

  const [type, setType] = useState(defaultType);
  const [amtDisplay, setAmtDisplay] = useState('');
  const [form, setForm] = useState(() => ({
    category: defaultType === 'Thu' ? 'Thu lãi tiền gửi ngân hàng' : 'Chi tiếp khách & Giao tế',
    payer_payee: '',
    payment_method: 'BANK_TRANSFER',
    contract_id: '',
    project_id: '',
    department_code: '',
    created_by: creatorName,
    approved_by: '',
  }));
  const [category, setCategory] = useState(defaultType === 'Thu' ? 'Thu lãi tiền gửi ngân hàng' : 'Chi tiếp khách & Giao tế');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (open) {
      const initType = defaultType || 'Thu';
      const initCat = initType === 'Thu' ? 'Thu lãi tiền gửi ngân hàng' : 'Chi tiếp khách & Giao tế';
      setType(initType);
      setAmtDisplay('');
      setCategory(initCat);
      setCustomCategory('');
      setDescription('');
      setError('');
      setForm({
        category: initCat,
        payer_payee: '',
        payment_method: 'BANK_TRANSFER',
        contract_id: '',
        project_id: '',
        department_code: '',
        created_by: creatorName,
        approved_by: '',
      });

      apiFetch(`${API}/api/finance/projects`)
        .then(d => setProjects(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      apiFetch(`${API}/api/finance/contracts`)
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      apiFetch(`${API}/api/finance/employees`)
        .then(d => setEmployees(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [open, defaultType, creatorName]);

  const handleTypeChange = (newType) => {
    setType(newType);
    const newCat = newType === 'Thu' ? 'Thu lãi tiền gửi ngân hàng' : 'Chi tiếp khách & Giao tế';
    setCategory(newCat);
    setForm(prev => ({
      ...prev,
      category: newCat,
      contract_id: '',
      project_id: ''
    }));
  };

  const contractOptions = useMemo(() => [
    { value: '', label: '— Không liên kết hợp đồng —' },
    ...contracts.map(c => ({
      value: c.id,
      label: `${c.id} — ${c.customer_name || 'Khách hàng'}${c.service_type ? ` (${c.service_type})` : ''}`
    }))
  ], [contracts]);

  const projectOptions = useMemo(() => [
    { value: '', label: '— Không liên kết hồ sơ / dự án —' },
    ...projects.map(p => ({
      value: p.id,
      label: `${p.id} — ${p.service_type || p.name || 'Hồ sơ kỹ thuật'}`
    }))
  ], [projects]);

  const partnerSuggestions = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Employees (Internal)
    employees.forEach(emp => {
      const name = (emp.full_name || emp.name || '').trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        const dept = emp.department_name || emp.department || emp.department_code || '';
        list.push({
          name,
          desc: dept ? `Nhân viên • ${dept}` : 'Nhân viên công ty',
          deptCode: emp.department_code || '',
          type: 'employee'
        });
      }
    });

    // 2. Customers from contracts
    contracts.forEach(c => {
      const name = (c.customer_name || '').trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({
          name,
          desc: `Khách hàng • HĐ ${c.id}`,
          deptCode: '',
          type: 'customer'
        });
      }
    });

    return list;
  }, [employees, contracts]);

  const handleContractChange = (cid) => {
    const matched = contracts.find(c => c.id === cid);
    setForm(prev => ({
      ...prev,
      contract_id: cid,
      payer_payee: (matched?.customer_name && !prev.payer_payee.trim()) ? matched.customer_name : prev.payer_payee
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền hợp lệ'); return; }

    const finalCategory = (category === 'Khác' ? (customCategory.trim() || 'Khác') : category) + (description.trim() ? ': ' + description.trim() : '');

    // Validation constraint for "Chi thụ lý bản vẽ"
    if (category === 'Chi thụ lý bản vẽ & Trích lục' && !form.contract_id && !form.project_id) {
      setError("Hạng mục 'Chi thụ lý bản vẽ & Trích lục' bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án!");
      return;
    }

    setSubmitting(true); setError('');
    try {
      const canonType = isIncome ? 'INCOME' : 'EXPENSE';
      await apiFetch(`${API}/api/finance/cashflow/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: canonType,
          amount,
          ...form,
          scope: 'COMPANY',
          category: finalCategory,
          description: description.trim(),
          contract_id: isIncome ? null : (form.contract_id || null),
          project_id: isIncome ? null : (form.project_id || null),
          department_code: form.department_code || null,
          created_by: creatorName,
          approved_by: form.approved_by || null
        })
      });
      addToast(`Đã thêm phiếu ${isIncome ? 'thu' : 'chi'} thành công!`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi server');
    } finally {
      setSubmitting(false);
    }
  };

  const isIncome = type === 'Thu' || type === 'INCOME';
  const accent = isIncome ? '#10b981' : '#ef4444';
  const currentCategoryOptions = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isIncome ? <PlusCircle size={18} color={accent} /> : <MinusCircle size={18} color={accent} />}
          <span style={{ color: accent }}>Lập {isIncome ? 'Phiếu Thu' : 'Phiếu Chi'}</span>
        </span>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['Thu', 'Chi'].map(t => (
            <button key={t} type="button" onClick={() => handleTypeChange(t)}
              style={{
                flex: 1, height: 40, borderRadius: 8, border: '2px solid',
                borderColor: (type === t || (t === 'Thu' && type === 'INCOME') || (t === 'Chi' && type === 'EXPENSE')) ? (t === 'Thu' ? '#10b981' : '#ef4444') : 'var(--border-default)',
                background: (type === t || (t === 'Thu' && type === 'INCOME') || (t === 'Chi' && type === 'EXPENSE')) ? (t === 'Thu' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)') : 'transparent',
                color: (type === t || (t === 'Thu' && type === 'INCOME') || (t === 'Chi' && type === 'EXPENSE')) ? (t === 'Thu' ? '#10b981' : '#ef4444') : 'var(--text-tertiary)',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
              }}>
              {t === 'Thu' ? '↑ Phiếu Thu' : '↓ Phiếu Chi'}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Số tiền *</label>
          <div style={{ position: 'relative' }}>
            <input autoFocus required className="form-control"
              value={amtDisplay} onChange={e => setAmtDisplay(fmtAmt(e.target.value))}
              type="text" inputMode="numeric" placeholder="0"
              style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'right', padding: '12px 48px 12px 12px', color: accent, borderColor: `${accent}55`, background: `${accent}06` }}
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: accent, fontWeight: 700, opacity: 0.7 }}>₫</span>
          </div>
        </div>

        <FormGrid cols={2}>
          <FormRow label="Hình thức" required>
            <Dropdown
              value={form.payment_method}
              onChange={(val) => setForm({ ...form, payment_method: val })}
              options={[
                { value: "BANK_TRANSFER", label: "Chuyển khoản" },
                { value: "CASH", label: "Tiền mặt" }
              ]}
              required
            />
          </FormRow>

          <FormRow
            label={isIncome ? "Người nộp tiền" : "Người nhận tiền"}
            required
            hint="Chọn từ gợi ý danh sách hoặc gõ tự do"
          >
            <div>
              <input
                required
                className="form-control"
                list="cashflow-partner-datalist"
                value={form.payer_payee}
                onChange={e => {
                  const val = e.target.value;
                  const matched = partnerSuggestions.find(p => p.name.toLowerCase() === val.toLowerCase());
                  setForm(prev => ({
                    ...prev,
                    payer_payee: val,
                    department_code: matched?.deptCode || prev.department_code
                  }));
                }}
                placeholder={isIncome ? 'Chọn hoặc nhập tên người nộp...' : 'Chọn hoặc nhập tên người nhận...'}
                autoComplete="off"
              />
              <datalist id="cashflow-partner-datalist">
                {partnerSuggestions.map((item, idx) => (
                  <option key={`opt-${idx}-${item.name}`} value={item.name}>
                    {item.desc}
                  </option>
                ))}
              </datalist>

              {/* Quick Select Chips */}
              {!form.payer_payee && employees.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Gợi ý:</span>
                  {employees.slice(0, 3).map(emp => {
                    const n = emp.full_name || emp.name;
                    if (!n) return null;
                    return (
                      <button
                        key={`chip-${emp.id || n}`}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, payer_payee: n, department_code: emp.department_code || p.department_code }))}
                        style={{
                          fontSize: '0.72rem',
                          padding: '1px 8px',
                          borderRadius: 10,
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          lineHeight: '1.4'
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </FormRow>

          <FormRow label="Hạng mục" required>
            <Dropdown
              value={category}
              onChange={(val) => {
                setCategory(val);
                const mapping = CATEGORY_AUTO_MAPPING[val];
                if (mapping) {
                  setForm(prev => ({
                    ...prev,
                    payer_payee: mapping.payer_payee || prev.payer_payee,
                    department_code: mapping.department_code || prev.department_code,
                  }));
                }
              }}
              options={currentCategoryOptions}
            />
          </FormRow>

          {category === 'Khác' ? (
            <FormRow label="Hạng mục tự nhập" required>
              <input required className="form-control" value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="Nhập tên hạng mục..." />
            </FormRow>
          ) : (
            <FormRow label="Diễn giải chi tiết" required>
              <input required className="form-control" value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Nhập chi tiết diễn giải giao dịch..." />
            </FormRow>
          )}

          {category === 'Khác' && (
            <FormRow label="Diễn giải chi tiết" required cols={2}>
              <input required className="form-control" value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Nhập chi tiết diễn giải giao dịch..." />
            </FormRow>
          )}

          {isIncome ? (
            <FormRow label="Hợp đồng liên kết" cols={2}>
              <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px dashed var(--border-default)', lineHeight: 1.4 }}>
                🔒 Thu tiền theo Hợp đồng được thực hiện tập trung tại màn hình <strong>Thu công nợ</strong> (đính kèm biên lai). Phiếu thu ở đây dành cho các khoản thu ngoài hợp đồng.
              </div>
            </FormRow>
          ) : (
            <>
              <FormRow label="Hợp đồng liên kết" required={category === 'Chi thụ lý bản vẽ & Trích lục' && !form.project_id}>
                <Dropdown
                  value={form.contract_id || ''}
                  onChange={handleContractChange}
                  options={contractOptions}
                />
              </FormRow>
              <FormRow label="Hồ sơ / Dự án" required={category === 'Chi thụ lý bản vẽ & Trích lục' && !form.contract_id}>
                <Dropdown
                  value={form.project_id || ''}
                  onChange={pid => setForm(prev => ({ ...prev, project_id: pid }))}
                  options={projectOptions}
                />
              </FormRow>
            </>
          )}
        </FormGrid>

        {!isIncome && form.payment_method === 'Tiền mặt' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f59e0b' }}>
            Hệ thống tự kiểm tra số dư quỹ tiền mặt trước khi ghi nhận.
          </div>
        )}

        {!currentUser?.is_director && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            ℹ️ Phiếu do <strong>{creatorName}</strong> lập sẽ chuyển sang trạng thái <strong style={{ color: '#f59e0b' }}>Chờ duyệt</strong> và cần Giám đốc phê duyệt trước khi ghi sổ quỹ.
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn" disabled={submitting}
            style={{ background: accent, color: '#fff', padding: '0 24px', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Đang xử lý...' : `Ghi nhận ${isIncome ? 'Phiếu Thu' : 'Phiếu Chi'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
