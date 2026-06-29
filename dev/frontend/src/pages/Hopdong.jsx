import React, { useState, useEffect } from 'react';
import { FileSignature, Table, Printer, Download, Plus } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Modal, FormRow, FormGrid, DataTable, StatusBadge, FilterBar } from '../components/ui';

export default function Hopdong() {
  const [contracts, setContracts] = useState([]);
  const [hosoList, setHosoList] = useState([]);
  const [config, setConfig] = useState({ personnel: [], services: [] });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState({ status: 'All', service: 'All' });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [sort, setSort] = useState('desc');

  const [formData, setFormData] = useState({
    SO_HOP_DONG: '', MA_HO_SO: '', TEN_KHACH_HANG: '', SO_DIEN_THOAI: '',
    KHACH_HANG_EMAIL: 'admin@nhadatbachkhoa.com', LOAI_DICH_VU: '',
    DIA_CHI: '', GIA_TRI_HOP_DONG: '', NGAY_KY: '', NGAY_HET_HAN: '', Sale_nguồn: ''
  });

  const fetchConfig = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/api/config');
      if (res.ok) setConfig(await res.json());
    } catch (err) { }
  };

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const params = month ? `?month=${month}` : '';
      const res = await fetch(`http://127.0.0.1:8080/api/hopdong${params}`);
      if (res.ok) {
        const data = await res.json();
        setContracts(Array.isArray(data) ? data : data.data || []);
      }
      const resHoso = await fetch('http://127.0.0.1:8080/api/hoso');
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
  }, []);

  useEffect(() => {
    fetchContracts();

    const d = new Date();
    const today = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 7);
    const nextWeek = d.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, NGAY_KY: today, NGAY_HET_HAN: nextWeek }));
  }, [month]);

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
      const res = await fetch('http://127.0.0.1:8080/api/hopdong/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, GIA_TRI_HOP_DONG: val })
      });
      if (res.ok) {
        const data = await res.json();
        addToast('Hợp đồng đã được tạo thành công!', 'success');
        if (data.download_url) {
          window.open(`http://127.0.0.1:8080${data.download_url}`);
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

  const columns = [
    {
      key: 'Mã hợp đồng',
      label: 'Mã HỢP ĐỒNG',
      width: 300,
      render: (val) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{val}</span>
    },
    {
      key: 'Mã hồ sơ',
      label: 'Mã hồ sơ',
      width: 300,
      render: (val) => <span style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
    },
    { key: 'Tên khách hàng', label: 'Khách hàng', width: 500 },
    {
      key: 'Giá trị hợp đồng',
      label: 'Giá trị',
      align: 'right',
      render: (val, row) => {
        const total = Number(val || row['Giá trị HĐ']) || 0;
        return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(total)}</span>;
      }
    },
    {
      key: 'Đã thu',
      label: 'Đã thu',
      align: 'right',
      render: (val, row) => {
        const paid = Number(val || row['Đã thanh toán']) || 0;
        return <span className="text-success" style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(paid)}</span>;
      }
    },
    {
      key: '_debt',
      label: 'Còn nợ',
      align: 'right',
      render: (_, row) => {
        const total = Number(row['Giá trị hợp đồng'] || row['Giá trị HĐ']) || 0;
        const paid = Number(row['Đã thu'] || row['Đã thanh toán']) || 0;
        return <span className="text-danger" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVND(total - paid)}</span>;
      }
    },
    {
      key: 'Tình trạng',
      label: 'Tình trạng',
      render: (val) => <StatusBadge status={val || 'Chờ thanh toán'} domain="hopdong" />
    },
    {
      key: 'File Hợp đồng',
      label: 'File',
      align: 'center',
      width: 100,
      render: (val) => val
        ? <a href={`http://127.0.0.1:8080${val}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
          <Download size={14} /> File HĐ
        </a>
        : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>
    }
  ];

  const filteredContracts = contracts.filter(c => {
    const matchSearch = (c['Mã hợp đồng'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (c['Mã hồ sơ'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (c['Tên khách hàng'] || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterValues.status === 'All' || c['Tình trạng'] === filterValues.status;
    const matchService = filterValues.service === 'All' || c['Loại dịch vụ'] === filterValues.service || c['Dịch vụ'] === filterValues.service;
    return matchSearch && matchStatus && matchService;
  });
  
  const sortedContracts = sort === 'asc' ? [...filteredContracts].reverse() : filteredContracts;

  return (
    <section className="tab-pane active" id="tab-hopdong">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Table size={24} color="var(--purple-500)" />
          Quản Lý Hợp Đồng & Công Nợ
        </h2>
      </div>

      <FilterBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Tìm mã HĐ, mã HS, khách hàng..."
        filters={[
          {
            key: 'status',
            label: 'Tình trạng',
            type: 'select',
            width: 180,
            options: [
              { value: 'Chờ thanh toán', label: 'Chờ thanh toán' },
              { value: 'Còn nợ', label: 'Còn nợ' },
              { value: 'Đã thu đủ', label: 'Đã thu đủ' }
            ]
          },
          {
            key: 'service',
            label: 'Dịch vụ',
            type: 'select',
            width: 220,
            options: config.services.map(s => ({ value: s, label: s }))
          }
        ]}
        values={filterValues}
        onFilterChange={(k, v) => setFilterValues(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearchTerm(''); setFilterValues({ status: 'All', service: 'All' }); setMonth(new Date().toISOString().slice(0, 7)); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ marginLeft: 8 }}>
              <Plus size={16} /> Soạn Hợp Đồng Mới
            </button>
          </>
        }
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={sortedContracts}
        loading={loading}
        rowKey="Mã hợp đồng"
        emptyText="Chưa có hợp đồng nào"
        pageSize={15}
      />

      {/* Modal Soạn Hợp Đồng */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="lg"
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSignature size={20} color="var(--orange-500)" /> Soạn Hợp Đồng Mới
          </span>
        }
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          Tự động điền mẫu Word và ghi công nợ vào hệ thống.
        </p>
        <form id="hopdong-form" onSubmit={handleGenerateContract}>
          <FormGrid cols={2}>
            <FormRow label="Mã hợp đồng" required>
              <input className="form-control" required value={formData.SO_HOP_DONG} onChange={e => setFormData({ ...formData, SO_HOP_DONG: e.target.value })} type="text" placeholder="128/BK-2026" />
            </FormRow>
            <FormRow label="Gắn hồ sơ (Tự động điền)">
              <select className="form-control" value={formData.MA_HO_SO} onChange={handleHosoChange}>
                <option value="">— Chọn Hồ Sơ —</option>
                {hosoList.map((h, i) => <option key={i} value={h['Mã hồ sơ']}>{h['Mã hồ sơ']} - {h['Tên khách hàng']}</option>)}
              </select>
            </FormRow>
            <FormRow label="Tên khách hàng" required>
              <input className="form-control" required value={formData.TEN_KHACH_HANG} onChange={e => setFormData({ ...formData, TEN_KHACH_HANG: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Số điện thoại" required>
              <input className="form-control" required value={formData.SO_DIEN_THOAI} onChange={e => setFormData({ ...formData, SO_DIEN_THOAI: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Địa chỉ BĐS" required cols={2}>
              <input className="form-control" required value={formData.DIA_CHI} onChange={e => setFormData({ ...formData, DIA_CHI: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Dịch vụ" required>
              <select className="form-control" required value={formData.LOAI_DICH_VU} onChange={e => setFormData({ ...formData, LOAI_DICH_VU: e.target.value })}>
                <option value="">— Chọn Dịch Vụ —</option>
                {config.services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <FormRow label="Sale / Nguồn" required>
              <input className="form-control" required value={formData.Sale_nguồn} onChange={e => setFormData({ ...formData, Sale_nguồn: e.target.value })} type="text" placeholder="Tên sale" />
            </FormRow>
            <FormRow label="Giá trị HĐ (VNĐ)" required>
              <input className="form-control" required value={formData.GIA_TRI_HOP_DONG} onChange={e => setFormData({ ...formData, GIA_TRI_HOP_DONG: e.target.value })} type="number" placeholder="15000000" />
            </FormRow>
            <FormRow label="Ngày ký" required>
              <input className="form-control" required value={formData.NGAY_KY} onChange={e => setFormData({ ...formData, NGAY_KY: e.target.value })} type="date" />
            </FormRow>
            <FormRow label="Hạn hoàn thành" required>
              <input className="form-control" required value={formData.NGAY_HET_HAN} onChange={e => setFormData({ ...formData, NGAY_HET_HAN: e.target.value })} type="date" />
            </FormRow>
          </FormGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}>
              <Printer size={16} style={{ marginRight: '8px' }} /> Xuất Word & Ghi dữ liệu
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
