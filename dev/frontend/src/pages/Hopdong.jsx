import React, { useState, useEffect } from 'react';
import { FileSignature, Table, Printer, Download, Plus } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export default function Hopdong() {
  const [contracts, setContracts] = useState([]);
  const [hosoList, setHosoList] = useState([]);
  const [config, setConfig] = useState({ personnel: [], services: [] });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    SO_HOP_DONG: '', MA_HO_SO: '', TEN_KHACH_HANG: '', SO_DIEN_THOAI: '',
    KHACH_HANG_EMAIL: 'admin@nhadatbachkhoa.com', LOAI_DICH_VU: '',
    DIA_CHI: '', GIA_TRI_HOP_DONG: '', NGAY_KY: '', NGAY_HET_HAN: '', Sale_nguồn: ''
  });

  const fetchConfig = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/config');
      if (res.ok) setConfig(await res.json());
    } catch (err) {}
  };

  const fetchContracts = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/hopdong');
      if (res.ok) {
        const data = await res.json();
        setContracts(Array.isArray(data) ? data : data.data || []);
      }
      const resHoso = await fetch('http://127.0.0.1:8000/api/hoso');
      if (resHoso.ok) {
        const hData = await resHoso.json();
        setHosoList(Array.isArray(hData) ? hData : hData.data || []);
      }
    } catch (err) {
      addToast('Lỗi tải danh sách hợp đồng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchContracts();

    const d = new Date();
    const today = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 7);
    const nextWeek = d.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, NGAY_KY: today, NGAY_HET_HAN: nextWeek }));
  }, []);

  const handleHosoChange = (e) => {
    const maHs = e.target.value;
    const hs = hosoList.find(h => h['Mã hồ sơ'] === maHs);
    if (hs) {
      setFormData(prev => ({
        ...prev,
        MA_HO_SO: maHs,
        TEN_KHACH_HANG: hs['Tên khách hàng'] || '',
        SO_DIEN_THOAI: hs['SĐT'] || '',
        DIA_CHI: hs['Khu vực/Phường'] || '',
        LOAI_DICH_VU: hs['Loại dịch vụ'] || ''
      }));
    } else {
      setFormData(prev => ({ ...prev, MA_HO_SO: maHs, TEN_KHACH_HANG: '', SO_DIEN_THOAI: '', DIA_CHI: '', LOAI_DICH_VU: '' }));
    }
  };

  const handleGenerateContract = async (e) => {
    e.preventDefault();
    const val = parseFloat(formData.GIA_TRI_HOP_DONG);
    if (!val || val <= 0) {
      addToast('Nhập giá trị hợp đồng hợp lệ', 'error');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/hopdong/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, GIA_TRI_HOP_DONG: val })
      });
      if (res.ok) {
        const data = await res.json();
        addToast('Hợp đồng đã được tạo thành công!', 'success');
        if (data.download_url) {
          window.open(`http://127.0.0.1:8000${data.download_url}`);
        }
        setFormData(prev => ({ ...prev, SO_HOP_DONG: '', GIA_TRI_HOP_DONG: '' }));
        setIsModalOpen(false);
        fetchContracts();
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
    <section className="tab-pane active" id="tab-hopdong">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Table size={24} color="var(--purple-500)" />
          Quản Lý Hợp Đồng & Công Nợ
        </h2>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> Soạn Hợp Đồng Mới
        </button>
      </div>

      <div className="card glass-card" style={{ padding: '24px', overflowX: 'auto' }}>
        <div className="table-wrap">
            <table style={{ minWidth: '900px' }}>
              <thead>
                <tr>
                  <th>Mã HĐ</th>
                  <th>Mã HS</th>
                  <th>Khách hàng</th>
                  <th>Giá trị</th>
                  <th>Đã thu</th>
                  <th>Còn nợ</th>
                  <th>Tình trạng</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
                ) : contracts.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có hợp đồng</td></tr>
                ) : (
                  contracts.map((c, i) => {
                    const total = Number(c['Giá trị hợp đồng'] || c['Giá trị HĐ']) || 0;
                    const paid = Number(c['Đã thu'] || c['Đã thanh toán']) || 0;
                    const debt = total - paid;
                    const status = c['Tình trạng'] || 'Chờ thanh toán';
                    const sCls = status === 'Đã tất toán' ? 'badge-success' : status === 'Quá hạn thanh toán' ? 'badge-danger' : 'badge-warning';
                    
                    let linkHtml = <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>;
                    const fileLink = c['File Hợp đồng'] || '';
                    if (fileLink) {
                      linkHtml = <a href={`http://127.0.0.1:8000${fileLink}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}><Download size={14} /> File HĐ</a>;
                    }

                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c['Mã hợp đồng']}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{c['Mã hồ sơ']}</td>
                        <td>{c['Tên khách hàng']}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(total)}</td>
                        <td className="text-success" style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(paid)}</td>
                        <td className="text-danger" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVND(debt)}</td>
                        <td><span className={`badge ${sCls}`}>{status}</span></td>
                        <td>{linkHtml}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Modal Soạn Hợp Đồng */}
      {isModalOpen && (
        <div className="modal-overlay open" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal card glass-card" style={{ maxWidth: '600px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 700 }}>
                <FileSignature size={20} color="var(--orange-500)" /> Soạn Hợp Đồng Mới
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0 0 0' }}>Tự động điền mẫu Word và ghi công nợ vào hệ thống.</p>
            </div>
            <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="flex" style={{ gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Mã hợp đồng *</label>
                    <input className="form-control" required value={formData.SO_HOP_DONG} onChange={e => setFormData({...formData, SO_HOP_DONG: e.target.value})} type="text" placeholder="128/BK-2026" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Gắn hồ sơ (Tự động điền)</label>
                    <select className="form-control" value={formData.MA_HO_SO} onChange={handleHosoChange}>
                      <option value="">— Chọn Hồ Sơ —</option>
                      {hosoList.map((h, i) => <option key={i} value={h['Mã hồ sơ']}>{h['Mã hồ sơ']} - {h['Tên khách hàng']}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex" style={{ gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Tên khách hàng *</label>
                    <input className="form-control" required value={formData.TEN_KHACH_HANG} onChange={e => setFormData({...formData, TEN_KHACH_HANG: e.target.value})} type="text" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>SĐT *</label>
                    <input className="form-control" required value={formData.SO_DIEN_THOAI} onChange={e => setFormData({...formData, SO_DIEN_THOAI: e.target.value})} type="text" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Địa chỉ BĐS *</label>
                  <input className="form-control" required value={formData.DIA_CHI} onChange={e => setFormData({...formData, DIA_CHI: e.target.value})} type="text" />
                </div>
                <div className="flex" style={{ gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Dịch vụ *</label>
                    <select className="form-control" required value={formData.LOAI_DICH_VU} onChange={e => setFormData({...formData, LOAI_DICH_VU: e.target.value})}>
                      <option value="">— Chọn Dịch Vụ —</option>
                      {config.services.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Sale / Nguồn *</label>
                    <input className="form-control" required value={formData.Sale_nguồn} onChange={e => setFormData({...formData, Sale_nguồn: e.target.value})} type="text" placeholder="Tên sale" />
                  </div>
                </div>
                <div className="flex" style={{ gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Giá trị HĐ (VNĐ) *</label>
                    <input className="form-control" required value={formData.GIA_TRI_HOP_DONG} onChange={e => setFormData({...formData, GIA_TRI_HOP_DONG: e.target.value})} type="number" placeholder="15000000" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Ngày ký *</label>
                    <input className="form-control" required value={formData.NGAY_KY} onChange={e => setFormData({...formData, NGAY_KY: e.target.value})} type="date" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Hạn hoàn thành *</label>
                  <input className="form-control" required value={formData.NGAY_HET_HAN} onChange={e => setFormData({...formData, NGAY_HET_HAN: e.target.value})} type="date" />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', background: 'var(--bg-deep)', borderTop: '1px solid var(--border-default)', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy bỏ</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}><Printer size={16} style={{ marginRight: '8px' }} /> Xuất Word & Ghi dữ liệu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
