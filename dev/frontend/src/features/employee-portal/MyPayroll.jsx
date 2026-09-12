import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  History,
  Calendar,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import './myPayroll.css';

const formatVND = (value) =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}₫`;

const formatMonth = (value) => {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length < 2) return value;
  return `Tháng ${Number(parts[1])}/${parts[0]}`;
};

const PAGE_SIZE = 12;

const getPayrollStatus = (payroll) => {
  const status = String(payroll?.status || '').toLowerCase();
  if (status === 'paid' || payroll?.is_paid) return 'paid';
  if (status === 'locked' || payroll?.is_locked) return 'locked';
  if (status === 'open' || status === 'opened' || (!status && payroll?.is_current)) return 'open';
  if (status === 'noperiod' || status === 'no_period') return 'no_period';
  return 'no_period';
};

const getPayrollStatusMeta = (payroll) => {
  switch (getPayrollStatus(payroll)) {
    case 'paid':
      return { label: 'Đã xác nhận chi trả', shortLabel: 'Đã xác nhận chi trả', className: 'is-paid', icon: CheckCircle2, caption: 'Đã xác nhận chi trả ngoài sổ' };
    case 'locked':
      return { label: 'Đã chốt sổ', shortLabel: 'Đã chốt', className: 'is-closed', icon: CheckCircle2, caption: 'Đã khóa sổ' };
    case 'open':
      return { label: 'Tạm tính', shortLabel: 'Kỳ này', className: 'is-current', icon: Clock, caption: 'Sẽ chốt khi hết kỳ' };
    default:
      return { label: 'Chưa chốt', shortLabel: 'Chưa chốt', className: 'is-closed', icon: Clock, caption: 'Chưa có kỳ chốt' };
  }
};

export default function MyPayroll({ isModal = false }) {
  const [profile, setProfile] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPayroll = async (month) => {
    setLoading(true);
    setError('');
    const url = month
      ? `/api/employee-portal/my-payroll?month=${encodeURIComponent(month)}`
      : '/api/employee-portal/my-payroll';
    try {
      let data;
      try {
        data = await apiFetch(url);
      } catch {
        data = await apiFetch('/api/employee-portal/me');
      }
      setProfile(data);
      if (data.selected_payroll?.month) {
        setSelectedMonth(data.selected_payroll.month.slice(0, 7));
      } else if (data.latest_payroll?.month) {
        setSelectedMonth(data.latest_payroll.month.slice(0, 7));
      }
    } catch {
      setError('Không tải được dữ liệu lương');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, []);

  const employee = profile?.employee || {};
  const history = useMemo(() => {
    return profile?.payroll_history || (profile?.latest_payroll ? [profile.latest_payroll] : []);
  }, [profile?.payroll_history, profile?.latest_payroll]);

  // Danh sách các năm có trong lịch sử để tạo bộ lọc
  const availableYears = useMemo(() => {
    const years = new Set();
    history.forEach((h) => {
      if (h.month) {
        const y = h.month.slice(0, 4);
        if (y) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [history]);

  // Lọc lịch sử theo năm được chọn
  const filteredHistory = useMemo(() => {
    if (selectedYear === 'ALL') return history;
    return history.filter((h) => (h.month || '').startsWith(selectedYear));
  }, [history, selectedYear]);

  // Phân trang lịch sử
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredHistory.slice(start, start + PAGE_SIZE);
  }, [filteredHistory, currentPage]);

  const handleYearChange = (year) => {
    setSelectedYear(year);
    setCurrentPage(1);
  };

  const handleSelectHistoryRow = (monthStr) => {
    if (!monthStr) return;
    const monthKey = monthStr.slice(0, 7);
    setSelectedMonth(monthKey);
  };

  if (loading && !profile) return <div className="my-payroll__state">Đang tải dữ liệu lương…</div>;
  if (error && !profile) return (
    <div className="my-payroll__state my-payroll__state--error" role="alert">
      <strong>Không tải được dữ liệu lương</strong>
      <p>Kiểm tra kết nối rồi thử tải lại để xem phiếu lương.</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchPayroll()}>
        Thử lại
      </button>
    </div>
  );

  const payroll =
    history.find((h) => (h.month || '').startsWith(selectedMonth)) ||
    profile?.selected_payroll ||
    profile?.latest_payroll;

  if (!payroll && (!history || history.length === 0)) {
    return (
      <section className={`my-payroll ${isModal ? 'my-payroll--modal' : 'my-payroll--screen card card--workspace my-payroll-workspace'}`}>
        <div className="my-payroll__state">
          Chưa có dữ liệu lương cho kỳ này. Lương sẽ hiện khi bộ phận nhân sự thiết lập mức lương cơ bản hoặc phát sinh khoán công việc.
        </div>
      </section>
    );
  }

  const _hasPiece = payroll ? Number(payroll.piece_amount) > 0 || Number(payroll.tasks_completed) > 0 : false;
  const adjustment = payroll ? Number(payroll.adjustment_amount) || 0 : 0;
  const isCurrentMonth =
    payroll?.is_current ||
    (payroll?.month &&
      new Date(payroll.month).getMonth() === new Date().getMonth() &&
      new Date(payroll.month).getFullYear() === new Date().getFullYear());
  const payrollStatus = getPayrollStatusMeta(payroll);
  const StatusIcon = payrollStatus.icon;

  return (
    <section className={`my-payroll ${isModal ? 'my-payroll--modal' : 'my-payroll--screen card card--workspace my-payroll-workspace'}`}>
      {/* Header trang — Chỉ hiển thị đầy đủ khi ở ngoài Screen, trong Modal chỉ hiển thị thanh trạng thái tinh gọn */}
      {!isModal ? (
        <header className="my-payroll__heading">
          <div className="my-payroll__title-group">
            <h2><Wallet size={22} /> Lương của tôi</h2>
            <p>
              {employee.full_name || 'Nhân viên'} {employee.job_title ? `· ${employee.job_title}` : ''}
            </p>
          </div>

          <div className="my-payroll__current-badge">
            <Calendar size={15} />
            <span>Đang xem: <strong>{formatMonth(payroll?.month)}</strong></span>
            <span className={`my-payroll__pill ${payrollStatus.className}`}>
              {isCurrentMonth && payrollStatus.label === 'Tạm tính' ? 'Kỳ này (Tạm tính)' : payrollStatus.label}
            </span>
          </div>
        </header>
      ) : (
        <div className="my-payroll__modal-subhead">
          <div className="my-payroll__modal-emp">
            <strong>{employee.full_name || 'Nhân viên'}</strong>
            {employee.job_title ? <span> · {employee.job_title}</span> : null}
          </div>
          <div className="my-payroll__current-badge my-payroll__current-badge--compact">
            <Calendar size={14} />
            <span>Kỳ xem: <strong>{formatMonth(payroll?.month)}</strong></span>
            <span className={`my-payroll__pill ${payrollStatus.className}`}>{payrollStatus.shortLabel}</span>
          </div>
        </div>
      )}

      {/* Khối tổng quan: một điểm nhấn chính và bảng cấu thành lương */}
      {payroll && (
        <div className="my-payroll__pay-summary">
          <div className="my-payroll__net-panel">
            <div className="my-payroll__net-head">
              <div>
                <span className="my-payroll__eyebrow">Kỳ lương</span>
                <span className="my-payroll__kpi-label">Tổng lương</span>
              </div>
              <span className={`my-payroll__status-tag ${payrollStatus.className}`}>
                <StatusIcon size={11} />
                {payrollStatus.label}
              </span>
            </div>
            <strong className="my-payroll__net-value">{formatVND(payroll.total_salary)}</strong>
            <span className="my-payroll__net-caption">
              {formatMonth(payroll.month)} · {payrollStatus.caption}
            </span>
          </div>

          <div className="my-payroll__breakdown" aria-label="Chi tiết cấu thành lương">
            <div className="my-payroll__breakdown-heading">
              <span>Chi tiết cấu thành lương</span>
              <span>Đơn vị: VNĐ</span>
            </div>
            <div className="my-payroll__breakdown-list">
              <div className="my-payroll__breakdown-item">
                <span className="my-payroll__breakdown-label">Lương cơ bản</span>
                <strong>{formatVND(payroll.base_salary)}</strong>
                <small>Theo hợp đồng lao động</small>
              </div>
              <div className="my-payroll__breakdown-item">
                <span className="my-payroll__breakdown-label">Lương khoán</span>
                <strong>{Number(payroll.piece_amount) > 0 ? formatVND(payroll.piece_amount) : '0₫'}</strong>
                <small>
                  {Number(payroll.tasks_completed) > 0
                    ? `${payroll.tasks_completed} việc nghiệm thu`
                    : 'Chưa có việc khoán'}
                </small>
              </div>
              <div className="my-payroll__breakdown-item">
                <span className="my-payroll__breakdown-label">Thưởng / khấu trừ</span>
                <strong className={adjustment < 0 ? 'is-negative' : adjustment > 0 ? 'is-positive' : ''}>
                  {adjustment !== 0 ? formatVND(adjustment) : '0₫'}
                </strong>
                <small>
                  {adjustment > 0 ? 'Đã duyệt thưởng' : adjustment < 0 ? 'Khoản khấu trừ' : 'Không phát sinh'}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KHỐI 2: Bảng lịch sử toàn bộ các kỳ (Full-Width Table) */}
      {history.length > 0 && (
        <div className="my-payroll__history-card">
          <div className="my-payroll__history-toolbar">
            <div className="my-payroll__history-title">
              <History size={16} />
              <h3>Lịch sử các kỳ lương</h3>
              <span className="my-payroll__history-badge">{filteredHistory.length} kỳ</span>
            </div>

            {/* Bộ lọc năm */}
            {availableYears.length > 1 && (
              <div className="my-payroll__year-pills" role="tablist">
                <button
                  type="button"
                  className={`my-payroll__year-pill ${selectedYear === 'ALL' ? 'is-active' : ''}`}
                  onClick={() => handleYearChange('ALL')}
                >
                  Tất cả
                </button>
                {availableYears.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`my-payroll__year-pill ${selectedYear === y ? 'is-active' : ''}`}
                    onClick={() => handleYearChange(y)}
                  >
                    Năm {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="responsive-table-hint my-payroll__table-hint" role="note">
            Vuốt ngang để xem đầy đủ lịch sử lương trên màn hình hẹp.
          </p>
          <div className="my-payroll__table-container">
            <table className="my-payroll__table">
              <thead>
                <tr>
                  <th>Kỳ lương</th>
                  <th className="is-num">Lương CB</th>
                  <th className="is-num">Khoán việc</th>
                  <th className="is-num">Điều chỉnh</th>
                  <th className="is-num">Tổng lương</th>
                  <th className="is-action"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((h) => {
                  const mKey = (h.month || '').slice(0, 7);
                  const isRowSelected = mKey === selectedMonth;
                  return (
                    <tr
                      key={mKey}
                      className={`${isRowSelected ? 'is-selected' : ''}${h.is_current ? ' is-current-row' : ''}`}
                      onClick={() => handleSelectHistoryRow(h.month)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectHistoryRow(h.month);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Xem chi tiết ${formatMonth(h.month)}`}
                      title="Bấm để xem chi tiết kỳ này ở khối tổng quan"
                    >
                      <td>
                        <div className="my-payroll__period-cell">
                          <strong>{formatMonth(h.month)}</strong>
                          {getPayrollStatus(h) === 'open' && h.is_current ? (
                            <span className="my-payroll__tag-curr">Kỳ này</span>
                          ) : getPayrollStatus(h) === 'paid' ? (
                            <span className="my-payroll__tag-paid">Đã xác nhận chi trả</span>
                          ) : getPayrollStatus(h) === 'locked' ? (
                            <span className="my-payroll__tag-locked">Đã chốt</span>
                          ) : getPayrollStatus(h) === 'no_period' ? (
                            <span className="my-payroll__tag-locked">Chưa chốt</span>
                          ) : (
                            <span className="my-payroll__tag-locked">Đang mở</span>
                          )}
                        </div>
                      </td>
                      <td className="is-num">{formatVND(h.base_salary)}</td>
                      <td className="is-num">
                        {Number(h.piece_amount) > 0 ? (
                          <span>
                            {formatVND(h.piece_amount)}
                            <small className="my-payroll__task-count"> ({h.tasks_completed}v)</small>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="is-num">
                        {Number(h.adjustment_amount) !== 0 ? (
                          <span className={Number(h.adjustment_amount) < 0 ? 'is-negative' : 'is-positive'}>
                            {formatVND(h.adjustment_amount)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="is-num">
                        <strong className="my-payroll__net-salary">{formatVND(h.total_salary)}</strong>
                      </td>
                      <td className="is-action">
                        <span className={`my-payroll__row-arrow ${isRowSelected ? 'is-active' : ''}`}>
                          <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Thanh điều khiển phân trang */}
          {totalPages > 1 && (
            <div className="my-payroll__pagination">
              <span className="my-payroll__page-info">
                Trang {currentPage} / {totalPages} ({(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filteredHistory.length)} trên {filteredHistory.length} kỳ)
              </span>
              <div className="my-payroll__pagination-btns">
                <button
                  type="button"
                  className="my-payroll__page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Trang trước"
                >
                  <ChevronLeft size={13} /> Trước
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                  <button
                    key={pNum}
                    type="button"
                    className={`my-payroll__page-btn ${pNum === currentPage ? 'is-active' : ''}`}
                    onClick={() => setCurrentPage(pNum)}
                  >
                    {pNum}
                  </button>
                ))}
                <button
                  type="button"
                  className="my-payroll__page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Trang tiếp theo"
                >
                  Sau <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}

          <aside className="my-payroll__support-note">
            <strong>Đối soát số liệu?</strong>
            <span>Liên hệ Giám đốc hoặc bộ phận Kế toán nếu cần giải thích thêm.</span>
          </aside>
        </div>
      )}
    </section>
  );
}
