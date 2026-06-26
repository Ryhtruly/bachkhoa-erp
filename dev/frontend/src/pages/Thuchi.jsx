import React, { useState, useEffect } from 'react';
import { PlusCircle, Receipt } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { DataTable, Badge } from '../components/ui';

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
        fetch('http://127.0.0.1:8080/api/config'),
        fetch('http://127.0.0.1:8080/api/hoso'),
        fetch('http://127.0.0.1:8080/api/hopdong'),
        fetch('http://127.0.0.1:8080/api/thuchi')
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

  useEffect(() => { fetchData(); }, []);

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

      const res = await fetch('http://127.0.0.1:8080/api/thuchi', {
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

  const columns = [
    {
      key: 'Ngày',
      label: 'Ngày',
      width: 110,
      render: (val, row) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          {val || row['Date']}
        </span>
      )
    },
    {
      key: 'Số phiếu',
      label: 'Số phiếu',
      width: 120,
      render: (val, row) => (
        <strong style={{ fontFamily: 'var(--font-mono)' }}>{val || row['Mã phiếu']}</strong>
      )
    },
    {
      key: 'Mã hồ sơ',
      label: 'Mã HS',
      width: 110,
      render: (val) => <span style={{ fontFamily: 'var(--font-mono)' }}>{val || '—'}</span>
    },
    {
      key: 'Diễn giải',
      label: 'Diễn giải',
      render: (val, row) => val || row['Ghi chú']
    },
    {
      key: 'Loại',
      label: 'Loại',
      width: 80,
      align: 'center',
      render: (val, row) => {
        const type = val || (row['Thu (+)'] > 0 ? 'Thu' : 'Chi');
        return <Badge variant={type === 'Thu' ? 'success' : 'danger'}>{type}</Badge>;
      }
    },
    {
      key: 'Số tiền',
      label: 'Số tiền',
      width: 130,
      align: 'right',
      render: (_, row) => {
        const type = row['Loại'] || (row['Thu (+)'] > 0 ? 'Thu' : 'Chi');
        const amount = type === 'Thu' ? row['Thu (+)'] : row['Chi (-)'];
        return (
          <span className={type === 'Thu' ? 'text-success' : 'text-danger'} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {type === 'Thu' ? '+' : '−'}{formatVND(amount)}
          </span>
        );
      }
    },
    {
      key: 'Hình thức',
      label: 'Hình thức',
      width: 110,
      align: 'center'
    }
  ];

  return (
    <section className="tab-pane active" id="tab-thuchi">
      <div className="split-view">
        {/* Form lập phiếu */}
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

        {/* Nhật ký quỹ */}
        <div className="card" style={{ padding: '24px', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Receipt size={16} color="var(--purple-400)" />
            Nhật ký quỹ
          </h3>
          <DataTable
            columns={columns}
            data={transactions}
            loading={loading}
            rowKey="Số phiếu"
            emptyText="Chưa có giao dịch nào"
            pageSize={10}
            compact
          />
        </div>
      </div>
    </section>
  );
}
