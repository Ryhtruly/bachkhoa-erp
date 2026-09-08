import React, { useState, useEffect } from 'react';
import {
  Compass,
  FileText,
  Building2,
  Phone,
  User,
  MapPin,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Clock,
  Send,
  HelpCircle,
  MessageCircle,
  RotateCcw
} from 'lucide-react';
import './customerIntake.css';

const DEFAULT_PACKAGES = [
  {
    id: 'sp_001',
    name: 'Đo Vẽ Bản Đồ',
    icon: Compass,
    badge: 'Kỹ thuật trắc địa',
    color: 'orange',
    services: [
      { id: 'tt_001', name: 'Đo hiện trạng vị trí', fieldType: 'area', label: 'Diện tích đất ước tính (m²)', placeholder: 'Ví dụ: 150 m² hoặc 1.200 m²', hint: 'Diện tích áng chừng theo sổ đỏ hoặc ước tính thực tế' },
      { id: 'tt_002', name: 'Cắm mốc ranh giới', fieldType: 'marker', label: 'Số lượng mốc cần cắm', placeholder: 'Ví dụ: 4 mốc ranh hoặc 6 mốc góc', hint: 'Số điểm mốc bê tông/ranh giới cần phục hồi theo tọa độ VN-2000' },
      { id: 'tt_006', name: 'Tách thửa (phần đo vẽ)', fieldType: 'parcel', label: 'Quy mô chia tách thửa', placeholder: 'Ví dụ: Tách thành 02 lô mới', hint: 'Số thửa đất bạn dự kiến phân tách' },
      { id: 'tt_005', name: 'Hợp thửa (phần đo vẽ)', fieldType: 'parcel', label: 'Quy mô hợp thửa', placeholder: 'Ví dụ: Gộp 02 thửa liền kề', hint: 'Số thửa đất bạn dự kiến gộp lại thành 1' },
      { id: 'tt_003', name: 'Hoàn công (phần đo vẽ)', fieldType: 'area', label: 'Diện tích sàn / Quy mô nhà', placeholder: 'Ví dụ: 120 m² sàn, 2 tầng', hint: 'Đo vẽ hiện trạng công trình sau xây dựng' },
      { id: 'tt_009', name: 'Xác định diện tích / Ranh tranh chấp', fieldType: 'area', label: 'Quy mô khu vực cần kiểm tra', placeholder: 'Ví dụ: Khoảng 300 m²', hint: 'Đo đạc kiểm tra ranh giới, diện tích thực tế' },
    ]
  },
  {
    id: 'sp_002',
    name: 'Pháp Lý Đất Đai',
    icon: FileText,
    badge: 'Hồ sơ hành chính',
    color: 'blue',
    services: [
      { id: 'tt_011', name: 'Cấp đổi sổ / Đổi phôi mới', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: 01 sổ đỏ chính chủ', hint: 'Đổi sổ cũ sang sổ hồng mới chuẩn theo mẫu mới' },
      { id: 'tt_016', name: 'Chuyển nhượng / Đăng bộ sang tên', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: 01 hồ sơ mua bán sang tên', hint: 'Hỗ trợ công chứng, thuế và nộp đăng bộ' },
      { id: 'tt_013', name: 'Tách thửa trọn gói', fieldType: 'parcel', label: 'Số thửa dự kiến tách', placeholder: 'Ví dụ: Tách 02 thửa', hint: 'Bao gồm cả đo vẽ và ra sổ từng thửa mới' },
      { id: 'tt_014', name: 'Cấp sổ lần đầu', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: 01 thửa đất cha ông để lại', hint: 'Lập hồ sơ xét duyệt cấp GCN lần đầu' },
      { id: 'tt_017', name: 'Tặng cho nhà đất', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: Cha mẹ tặng cho con', hint: 'Soạn thảo văn bản và sang tên giấy tờ' },
      { id: 'tt_018', name: 'Thừa kế / Khai nhận di sản', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: 01 hồ sơ phân chia thừa kế', hint: 'Hồ sơ khai nhận di sản thừa kế theo quy định' },
      { id: 'tt_015', name: 'Chuyển mục đích sử dụng đất', fieldType: 'dossier', label: 'Diện tích lên thổ cư (m²)', placeholder: 'Ví dụ: Xin lên 100 m² đất ở', hint: 'Chuyển đất nông nghiệp sang đất ở' },
    ]
  },
  {
    id: 'sp_003',
    name: 'Xin Phép Xây Dựng',
    icon: Building2,
    badge: 'Hồ sơ cấp phép',
    color: 'emerald',
    services: [
      { id: 'tt_020', name: 'Xin phép xây dựng mới', fieldType: 'construction', label: 'Quy mô công trình dự kiến', placeholder: 'Ví dụ: 1 trệt 2 lầu, diện tích sàn 250 m²', hint: 'Bao gồm bản vẽ xin phép và nộp UBND quận/huyện' },
      { id: 'tt_021', name: 'Sửa chữa, cải tạo công trình', fieldType: 'construction', label: 'Quy mô cải tạo', placeholder: 'Ví dụ: Nâng tầng, sửa mặt tiền', hint: 'Xin phép cải tạo thay đổi kết cấu' },
      { id: 'tt_022', name: 'Gia hạn giấy phép xây dựng', fieldType: 'dossier', label: 'Quy mô hồ sơ', placeholder: 'Ví dụ: 01 giấy phép cấp năm 2025', hint: 'Gia hạn hiệu lực giấy phép đã cấp' },
    ]
  }
];

export default function CustomerIntakePage() {
  const [packages, setPackages] = useState(DEFAULT_PACKAGES);
  const [selectedPackageId, setSelectedPackageId] = useState('sp_001');
  const [selectedServiceId, setSelectedServiceId] = useState('tt_001');
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    scale_info: '',
    target_property_address: '',
    customer_address: '',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedData, setSubmittedData] = useState(null);
  const [showQr, setShowQr] = useState(false);

  // Tải danh mục dịch vụ thực tế từ API nếu có
  useEffect(() => {
    fetch('/api/intake/services')
      .then(res => res.json())
      .then(res => {
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          const merged = DEFAULT_PACKAGES.map(pkg => {
            const apiPkg = res.data.find(p => p.id === pkg.id);
            if (apiPkg && apiPkg.services?.length > 0) {
              return {
                ...pkg,
                services: apiPkg.services.map(s => {
                  const matched = pkg.services.find(ds => ds.id === s.id || ds.name === s.name);
                  return {
                    id: s.id,
                    name: s.name,
                    fieldType: matched?.fieldType || 'text',
                    label: matched?.label || 'Quy mô / Thông số',
                    placeholder: matched?.placeholder || 'Nhập quy mô cụ thể',
                    hint: matched?.hint || ''
                  };
                })
              };
            }
            return pkg;
          });
          setPackages(merged);
        }
      })
      .catch(() => {});
  }, []);

  const currentPackage = packages.find(p => p.id === selectedPackageId) || packages[0];
  const currentService = currentPackage.services.find(s => s.id === selectedServiceId) || currentPackage.services[0];

  const handlePackageSelect = (pkgId) => {
    setSelectedPackageId(pkgId);
    const targetPkg = packages.find(p => p.id === pkgId);
    if (targetPkg && targetPkg.services?.length > 0) {
      setSelectedServiceId(targetPkg.services[0].id);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.customer_name.trim()) {
      setErrorMsg('Vui lòng nhập họ và tên của bạn.');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 11) {
      setErrorMsg('Vui lòng nhập số điện thoại hợp lệ (9 - 11 chữ số).');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        customer_name: formData.customer_name.trim(),
        phone: formData.phone.trim(),
        address: formData.customer_address.trim() || formData.target_property_address.trim(),
        service_package_id: selectedPackageId,
        service_type: currentService?.name || 'Tư vấn dịch vụ',
        scale_info: formData.scale_info.trim() || (currentPackage.id === 'sp_002' ? '01 bộ hồ sơ' : 'Theo hiện trạng'),
        target_property_address: formData.target_property_address.trim(),
        notes: formData.notes.trim(),
        source: 'Web Form (Zalo)'
      };

      const res = await fetch('/api/intake/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Không thể gửi yêu cầu. Vui lòng thử lại sau.');
      }

      setSubmittedData({
        lead_id: json.data?.lead_id || 'LEAD-MỚI',
        customer_name: formData.customer_name,
        phone: formData.phone,
        service_name: currentService?.name,
        package_name: currentPackage?.name,
        scale_info: payload.scale_info,
        target_address: formData.target_property_address
      });
    } catch (err) {
      setErrorMsg(err.message || 'Có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmittedData(null);
    setFormData({
      customer_name: '',
      phone: '',
      scale_info: '',
      target_property_address: '',
      customer_address: '',
      notes: '',
    });
  };

  return (
    <div className="intake-page-wrapper">
      {/* Ambient background matching App.jsx */}
      <div className="intake-ambient-bg" />

      {/* Official Bách Khoa Brand Header */}
      <header className="intake-header">
        <div className="intake-brand-badge">
          <svg
            className="intake-brand-logo-svg"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="intakeBkPillarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffbe0b" />
                <stop offset="35%" stopColor="#fb5607" />
                <stop offset="100%" stopColor="#eb4a23" />
              </linearGradient>
              <linearGradient id="intakeBkMonogramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff5400" />
                <stop offset="100%" stopColor="#c1121f" />
              </linearGradient>
            </defs>
            <path d="M20 32 L38 12 V86 H20 Z" fill="url(#intakeBkPillarGrad)" />
            <path
              d="M44 26 L62 44 L84 66 C91 73 89 86 76 86 H44 V26 Z M58 60 L72 74 H58 V60 Z"
              fill="url(#intakeBkMonogramGrad)"
            />
          </svg>
          <div className="intake-brand-text">
            <div className="intake-brand-name">
              <span>BÁCH KH</span>
              <svg className="intake-brand-crosshair" viewBox="0 0 24 24" width="14" height="14">
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.6" />
                <line x1="1" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span>A</span>
            </div>
            <div className="intake-brand-line" />
            <div className="intake-brand-sub">ĐO ĐẠC - KIẾN TRÚC - XÂY DỰNG</div>
          </div>
        </div>

        <div className="intake-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="badge badge--orange" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
              <Sparkles size={13} style={{ marginRight: '4px' }} />
              Tiếp nhận 24/7 • Chuyên viên tư vấn kỹ thuật miễn phí
            </span>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="badge badge--neutral"
              style={{ padding: '6px 12px', cursor: 'pointer', border: '1px solid var(--border-default)', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
              title="Quét mã QR để mở trên điện thoại"
            >
              📱 Quét Mã QR
            </button>
          </div>
          <h1 className="intake-headline">Đăng Ký Khảo Sát & Báo Giá Dịch Vụ</h1>
          <p className="intake-subhead">
            Điền thông tin thửa đất và nhu cầu của bạn. Kỹ sư Bách Khoa sẽ liên hệ phản hồi phương án & chi phí trong vòng 15 phút.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="intake-main">
        {submittedData ? (
          /* MÀN HÌNH THÀNH CÔNG */
          <div className="intake-card intake-success-wrap">
            <div className="intake-success-icon">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="intake-success-title">Đã Tiếp Nhận Thành Công!</h2>
            <p className="intake-success-desc">
              Cảm ơn quý khách <strong>{submittedData.customer_name}</strong>. Yêu cầu của bạn đã được chuyển tới bộ phận kỹ thuật để lên phương án đo vẽ / pháp lý.
            </p>

            <div className="intake-ticket-summary">
              <div className="intake-ticket-item">
                <span className="intake-ticket-label">Mã phiếu tiếp nhận:</span>
                <span className="intake-ticket-id">{submittedData.lead_id}</span>
              </div>
              <div className="intake-ticket-item">
                <span className="intake-ticket-label">Số điện thoại:</span>
                <span className="intake-ticket-val">{submittedData.phone}</span>
              </div>
              <div className="intake-ticket-item">
                <span className="intake-ticket-label">Dịch vụ yêu cầu:</span>
                <span className="intake-ticket-val" style={{ color: 'var(--orange-600)' }}>
                  {submittedData.service_name}
                </span>
              </div>
              {submittedData.scale_info && (
                <div className="intake-ticket-item">
                  <span className="intake-ticket-label">Quy mô / Diện tích:</span>
                  <span className="intake-ticket-val">{submittedData.scale_info}</span>
                </div>
              )}
              {submittedData.target_address && (
                <div className="intake-ticket-item">
                  <span className="intake-ticket-label">Địa chỉ thửa đất:</span>
                  <span className="intake-ticket-val">{submittedData.target_address}</span>
                </div>
              )}
            </div>

            <div className="intake-success-actions">
              <a
                href="https://zalo.me/0349792855"
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-zalo"
              >
                <MessageCircle size={17} /> Nhắn Zalo Trực Tiếp Kỹ Sư
              </a>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary"
              >
                <RotateCcw size={15} /> Gửi Thêm Yêu Cầu Khác
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              <Clock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
              Thời gian phản hồi hỗ trợ: 8h00 – 18h00 các ngày trong tuần.
            </p>
          </div>
        ) : (
          /* FORM NHẬP THÔNG TIN */
          <form className="intake-card" onSubmit={handleSubmit}>
            {/* Bước 1: Chọn gói dịch vụ */}
            <div className="intake-section">
              <div className="intake-section-head">
                <div className="intake-step-num">1</div>
                <div>
                  <h3 className="intake-step-title">Bạn cần hỗ trợ dịch vụ gì?</h3>
                  <p className="intake-step-subtitle">Chọn nhóm công việc bạn đang quan tâm</p>
                </div>
              </div>

              {/* Package Cards */}
              <div className="intake-pkg-grid">
                {packages.map(pkg => {
                  const Icon = pkg.icon;
                  const isSelected = pkg.id === selectedPackageId;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      className={`intake-pkg-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handlePackageSelect(pkg.id)}
                    >
                      <div className={`intake-pkg-icon intake-pkg-icon--${pkg.color}`}>
                        <Icon size={22} />
                      </div>
                      <div className="intake-pkg-name">{pkg.name}</div>
                      <span className="intake-pkg-badge">{pkg.badge}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sub-services Selector */}
              <div className="intake-subservice-panel">
                <label>
                  Hạng mục chi tiết thuộc gói <strong>{currentPackage.name}</strong>:
                </label>
                <div className="intake-chips-wrap">
                  {currentPackage.services.map(svc => (
                    <button
                      key={svc.id}
                      type="button"
                      className={`intake-chip-btn ${svc.id === selectedServiceId ? 'active' : ''}`}
                      onClick={() => setSelectedServiceId(svc.id)}
                    >
                      {svc.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bước 2: Thông số kỹ thuật thông minh */}
            <div className="intake-section">
              <div className="intake-section-head">
                <div className="intake-step-num">2</div>
                <div>
                  <h3 className="intake-step-title">Thông tin thửa đất & Quy mô</h3>
                  <p className="intake-step-subtitle">Giúp kỹ sư tính toán báo giá chính xác nhất</p>
                </div>
              </div>

              <div className="intake-form-grid">
                {/* Dynamic Scale Field */}
                <div className="intake-form-group intake-grid-full">
                  <label>
                    {currentService?.label || 'Quy mô / Diện tích (tạm tính)'}
                  </label>
                  <input
                    type="text"
                    name="scale_info"
                    className="form-control"
                    value={formData.scale_info}
                    onChange={handleInputChange}
                    placeholder={currentService?.placeholder || 'Ví dụ: 120 m² hoặc 4 mốc'}
                  />
                  {currentService?.hint && (
                    <span className="intake-field-hint">
                      <HelpCircle size={13} /> {currentService.hint}
                    </span>
                  )}
                </div>

                {/* Vị trí đất */}
                <div className="intake-form-group intake-grid-full">
                  <label>
                    Địa chỉ thửa đất / Khu vực cần thực hiện <span className="intake-req-star">*</span>
                  </label>
                  <div className="intake-input-wrap">
                    <MapPin size={16} className="intake-input-icon" />
                    <input
                      type="text"
                      name="target_property_address"
                      className="form-control intake-form-control-has-icon"
                      value={formData.target_property_address}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: Thửa 124, Tờ 45, Xã Bình Mỹ, Củ Chi (hoặc số nhà, tên đường)"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bước 3: Thông tin người liên hệ */}
            <div className="intake-section">
              <div className="intake-section-head">
                <div className="intake-step-num">3</div>
                <div>
                  <h3 className="intake-step-title">Thông tin người liên hệ</h3>
                  <p className="intake-step-subtitle">Để chúng tôi gửi phương án & bản vẽ cho bạn</p>
                </div>
              </div>

              <div className="intake-form-grid">
                <div className="intake-form-group">
                  <label>
                    Họ và tên của bạn / Tên công ty <span className="intake-req-star">*</span>
                  </label>
                  <div className="intake-input-wrap">
                    <User size={16} className="intake-input-icon" />
                    <input
                      type="text"
                      name="customer_name"
                      className="form-control intake-form-control-has-icon"
                      value={formData.customer_name}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: Nguyễn Văn An"
                      required
                    />
                  </div>
                </div>

                <div className="intake-form-group">
                  <label>
                    Số điện thoại Zalo <span className="intake-req-star">*</span>
                  </label>
                  <div className="intake-input-wrap">
                    <Phone size={16} className="intake-input-icon" />
                    <input
                      type="tel"
                      name="phone"
                      className="form-control intake-form-control-has-icon"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: 0912345678"
                      required
                    />
                  </div>
                </div>

                <div className="intake-form-group intake-grid-full">
                  <label>Nhu cầu cụ thể hoặc ghi chú thêm (nếu có)</label>
                  <textarea
                    name="notes"
                    className="form-control"
                    rows={3}
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="Ghi chú thêm về hiện trạng đất, thời gian cần khảo sát, yêu cầu hồ sơ..."
                    style={{ minHeight: '84px', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="intake-error-box">
                {errorMsg}
              </div>
            )}

            {/* Submit Action */}
            <div className="intake-submit-wrap">
              <button
                type="submit"
                className="btn btn-primary intake-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>Đang gửi thông tin...</>
                ) : (
                  <>
                    <Send size={17} /> Gửi Yêu Cầu Khảo Sát & Nhận Báo Giá
                  </>
                )}
              </button>

              <div className="intake-trust-badges">
                <span>
                  <ShieldCheck size={14} color="var(--green-500)" /> Bảo mật thông tin
                </span>
                <span>•</span>
                <span>
                  <Clock size={14} color="var(--orange-500)" /> Phản hồi sau 15 phút
                </span>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="intake-footer">
        <p>
          <strong>CÔNG TY CỔ PHẦN ĐO ĐẠC KIẾN TRÚC XÂY DỰNG BÁCH KHOA</strong>
        </p>
        <p>Hệ thống tự động tiếp nhận thông tin khách hàng & tạo hợp đồng dịch vụ</p>
      </footer>

      {/* Modal QR Code Mobile */}
      {showQr && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setShowQr(false)}
        >
          <div
            className="intake-card"
            style={{ maxWidth: '360px', width: '100%', textAlign: 'center', background: '#ffffff', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Mã QR Mở Trên Điện Thoại
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.4 }}>
              Mở Camera hoặc ứng dụng Zalo quét mã dưới đây để điền form nhanh trên điện thoại:
            </p>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'inline-block', marginBottom: '16px' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(window.location.href)}&margin=6`}
                alt="QR Code Form Tiếp Nhận Bách Khoa"
                width={220}
                height={220}
                style={{ display: 'block', borderRadius: '6px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(window.location.href)}&margin=10`}
                download="QR_BachKhoa_TiepNhan.png"
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm"
                style={{ flex: 1, textDecoration: 'none' }}
              >
                Tải ảnh QR (.PNG)
              </a>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="btn btn-secondary btn-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
