import React, { useState, useEffect } from 'react';
import { PlusCircle, Receipt } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export default function Thuchi() {
  const [transactions, setTransactions] = useState([]);
  const [hosoList, setHosoList] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [config, setConfig] = useState({ departments: [] });
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    Loại_Thu_Chi: 'Phiếu Thu (+)', Mã_hồ_sơ: '', Mã_hợp_đồng: '',
    Diễn_giải: '', Phòng_ban: '', Người_nhận_Nộp: '',
    Hình_thức: 'Chuyển khoản', Số_tiền: ''
  });

  const fetchData = async () => {
    try {
      const [resConfig, resHoso, resHopdong, resThuchi] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/config'),
        fetch('http://127.0.0.1:8000/api/hoso'),
        fetch('http://127.0.0.1:8000/api/hopdong'),
        fetch('http://127.0.0.1:8000/api/thuchi')
      ]);

      if (resConfig.ok) setConfig(await resConfig.json());
      
      if (resHoso.ok) {
        const data = await resHoso.json();
        setHosoList(Array.isArray(data) ? data : data.data || []);
      }
      
      if (resHopdong.ok) {
        const data = await resHopdong.json();
        setContracts(Array.isArray(data) ? data : data.data || []);
      }

      if (resThuchi.ok) {
        const data = await resThuchi.json();
        setTransactions(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      addToast('Lỗi tải dữ liệu thu chi', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateThuchi = async (e) => {
    e.preventDefault();
    const amt = parseFloat(formData.Số_tiền);
    if (!amt || amt <= 0) {
      addToast('Nhập số tiền hợp lệ', 'error');
      return;
    }

    try {
      const payload = {
        ...formData,
        Số_tiền: amt,
        Loại_Thu_Chi: formData.Loại_Thu_Chi.includes('Thu') ? 'Thu' : 'Chi'
      };

      const res = await fetch('http://127.0.0.1:8000/api/thuchi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        addToast('Ghi sổ quỹ thành công!', 'success');
        setFormData({ ...formData, Diễn_giải: '', Số_tiền: '', Người_nhận_Nộp: '' });
        fetchData();
      } else {
        const err = await res.json();
        addToast('Lỗi: ' + (err.detail || ''), 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ', 'error');
    }
  };

  const formatVND = (amount) => {
    try { return new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + '₫'; } catch { return amount; }
  };

  return (
    <section className="tab-pane active" id="tab-thuchi">
      <div className="split-view">
        <div className="card" style={{ padding: '24px' }}>
          <h3><PlusCircle size={20} /> Lập phiếu thu / chi</h3>
          <div className="sub">Ghi nhận giao dịch và liên kết với hồ sơ / hợp đồng.</div>
          <form onSubmit={handleCreateThuchi} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div className="flex" style={{ gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label>Loại</label>
                <select required value={formData.Loại_Thu_Chi} onChange={e => setFormData({...formData, Loại_Thu_Chi: e.target.value})}>
                  <option>Phiếu Thu (+)</option>
                  <option>Phiếu Chi (-)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Số tiền</label>
                <input required value={formData.Số_tiền} onChange={e => setFormData({...formData, Số_tiền: e.target.value})} type="number" placeholder="200000" />
              </div>
            </div>
            <div className="flex" style={{ gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label>Mã hồ sơ (Tuỳ chọn)</label>
                <select value={formData.Mã_hồ_sơ} onChange={e => setFormData({...formData, Mã_hồ_sơ: e.target.value})}>
                  <option value="">Không liên kết</option>
                  {hosoList.map((h, i) => <option key={i} value={h['Mã hồ sơ']}>{h['Mã hồ sơ']}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Mã hợp đồng (Tuỳ chọn)</label>
                <select value={formData.Mã_hợp_đồng} onChange={e => setFormData({...formData, Mã_hợp_đồng: e.target.value})}>
                  <option value="">Không liên kết</option>
                  {contracts.map((c, i) => <option key={i} value={c['Mã hợp đồng']}>{c['Mã hợp đồng']}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label>Phòng ban</label>
              <select value={formData.Phòng_ban} onChange={e => setFormData({...formData, Phòng_ban: e.target.value})}>
                <option value="">— Chọn phòng ban —</option>
                {config.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>Diễn giải</label>
              <input required value={formData.Diễn_giải} onChange={e => setFormData({...formData, Diễn_giải: e.target.value})} type="text" placeholder="Nộp phí trích lục..." />
            </div>
            <div className="flex" style={{ gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label>Hình thức</label>
                <select value={formData.Hình_thức} onChange={e => setFormData({...formData, Hình_thức: e.target.value})}>
                  <option>Chuyển khoản</option>
                  <option>Tiền mặt</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Người nhận / nộp</label>
                <input required value={formData.Người_nhận_Nộp} onChange={e => setFormData({...formData, Người_nhận_Nộp: e.target.value})} type="text" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '44px', marginTop: '12px' }}>
              Ghi nhận chứng từ
            </button>
          </form>
        </div>
        
        <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Receipt size={16} color="var(--purple-400)" />
              Nhật ký quỹ
            </h3>
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Số phiếu</th>
                  <th>Mã HS</th>
                  <th>Diễn giải</th>
                  <th>Loại</th>
                  <th>Số tiền</th>
                  <th>Hình thức</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có giao dịch</td></tr>
                ) : (
                  transactions.map((t, i) => {
                    const type = t['Loại'] || (t['Thu (+)'] > 0 ? 'Thu' : 'Chi');
                    const amount = type === 'Thu' ? t['Thu (+)'] : t['Chi (-)'];
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{t['Ngày'] || t['Date']}</td>
                        <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{t['Số phiếu'] || t['Mã phiếu']}</strong></td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{t['Mã hồ sơ'] || '—'}</td>
                        <td>{t['Diễn giải'] || t['Ghi chú']}</td>
                        <td><span className={`badge ${type === 'Thu' ? 'badge-success' : 'badge-danger'}`}>{type}</span></td>
                        <td className={type === 'Thu' ? 'text-success' : 'text-danger'} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {type === 'Thu' ? '+' : '−'}{formatVND(amount)}
                        </td>
                        <td>{t['Hình thức']}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
