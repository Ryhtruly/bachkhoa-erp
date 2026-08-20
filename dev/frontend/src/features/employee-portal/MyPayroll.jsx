import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  Landmark,
  ClipboardCheck,
  History,
  Calendar,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
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

export default function MyPayroll({ isModal = false }) {
  const [profile, setProfile] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPayroll = (month) => {
    setLoading(true);
    setError('');
    const url = month
      ? `/api/employee-portal/my-payroll?month=${encodeURIComponent(month)}`
      : '/api/employee-portal/my-payroll';
    apiFetch(url)
      .then((data) => {
        setProfile(data);
        if (data.selected_payroll?.month) {
          setSelectedMonth(data.selected_payroll.month.slice(0, 7));
        } else if (data.latest_payroll?.month) {
          setSelectedMonth(data.latest_payroll.month.slice(0, 7));
        }
      })
      .catch(() => {
        apiFetch('/api/employee-portal/me')
          .then((data) => {
            setProfile(data);
            if (data.latest_payroll?.month) {
              setSelectedMonth(data.latest_payroll.month.slice(0, 7));
            }
          })
          .catch(() => {
            setError('Không tải được dữ liệu lương');
          });
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPayroll();
  }, []);

  const employee = profile?.employee || {};
  const history = profile?.payroll_history || (profile?.latest_payroll ? [profile.latest_payroll] : []);

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
  if (error && !profile) return <div className="my-payroll__state">{error}</div>;

  const payroll =
    history.find((h) => (h.month || '').startsWith(selectedMonth)) ||
    profile?.selected_payroll ||
    profile?.latest_payroll;

  if (!payroll && (!history || history.length === 0)) {
    return (
      <section className={`my-payroll ${isModal ? 'my-payroll--modal' : 'my-payroll--screen'}`}>
        <div className="my-payroll__state">
          Chưa có dữ liệu lương cho kỳ này. Lương sẽ hiện khi bộ phận nhân sự thiết lập mức lương cơ bản hoặc phát sinh khoán công việc.
        </div>
      </section>
    );
  }

  const hasPiece = payroll ? Number(payroll.piece_amount) > 0 || Number(payroll.tasks_completed) > 0 : false;
  const adjustment = payroll ? Number(payroll.adjustment_amount) || 0 : 0;
  const isCurrentMonth =
    payroll?.is_current ||
    (payroll?.month &&
      new Date(payroll.month).getMonth() === new Date().getMonth() &&
      new Date(payroll.month).getFullYear() === new Date().getFullYear());

  return (
    <section className={`my-payroll ${isModal ? 'my-payroll--modal' : 'my-payroll--screen'}`}>
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
            {isCurrentMonth ? (
              <span className="my-payroll__pill is-current">Kỳ này (Tạm tính)</span>
            ) : (
              <span className="my-payroll__pill is-closed">Đã chốt sổ</span>
            )}
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
            {isCurrentMonth ? (
              <span className="my-payroll__pill is-current">Tạm tính</span>
            ) : (
              <span className="my-payroll__pill is-closed">Đã chốt</span>
            )}
          </div>
        </div>
      )}

      {/* KHỐI 1: 4 Thẻ KPI Summary hiển thị ngang */}
      {payroll && (
        <div className="my-payroll__kpi-grid">
          {/* KPI 1: Tổng thực lĩnh */}
          <div className="my-payroll__kpi-card my-payroll__kpi-card--primary">
            <div className="my-payroll__kpi-head">
              <span className="my-payroll__kpi-label">Tổng thực nhận</span>
              <span className={`my-payroll__status-tag ${isCurrentMonth ? 'is-current' : 'is-closed'}`}>
                {isCurrentMonth ? <Clock size={11} /> : <CheckCircle2 size={11} />}
                {isCurrentMonth ? 'Tạm tính' : 'Đã chốt'}
              </span>
            </div>
            <div className="my-payroll__kpi-val">{formatVND(payroll.total_salary)}</div>
            <div className="my-payroll__kpi-sub">
              {formatMonth(payroll.month)} · {isCurrentMonth ? 'Sẽ chốt khi hết kỳ' : 'Đã khóa sổ'}
            </div>
          </div>

          {/* KPI 2: Lương cơ bản */}
          <div className="my-payroll__kpi-card">
            <div className="my-payroll__kpi-head">
              <span className="my-payroll__kpi-label">Lương cơ bản</span>
              <div className="my-payroll__kpi-icon is-orange"><Landmark size={14} /></div>
            </div>
            <div className="my-payroll__kpi-val">{formatVND(payroll.base_salary)}</div>
            <div className="my-payroll__kpi-sub">Theo hợp đồng LĐ</div>
          </div>

          {/* KPI 3: Lương khoán việc */}
          <div className="my-payroll__kpi-card">
            <div className="my-payroll__kpi-head">
              <span className="my-payroll__kpi-label">Lương khoán</span>
              <div className="my-payroll__kpi-icon is-blue"><ClipboardCheck size={14} /></div>
            </div>
            <div className="my-payroll__kpi-val">
              {Number(payroll.piece_amount) > 0 ? formatVND(payroll.piece_amount) : '0₫'}
            </div>
            <div className="my-payroll__kpi-sub">
              {Number(payroll.tasks_completed) > 0
                ? `${payroll.tasks_completed} việc nghiệm thu`
                : 'Chưa có việc khoán'}
            </div>
          </div>

          {/* KPI 4: Thưởng / Khấu trừ */}
          <div className="my-payroll__kpi-card">
            <div className="my-payroll__kpi-head">
              <span className="my-payroll__kpi-label">Thưởng / Trừ</span>
              <div className="my-payroll__kpi-icon is-green"><TrendingUp size={14} /></div>
            </div>
            <div className={`my-payroll__kpi-val ${adjustment < 0 ? 'is-negative' : ''}`}>
              {adjustment !== 0 ? formatVND(adjustment) : '0₫'}
            </div>
            <div className="my-payroll__kpi-sub">
              {adjustment > 0 ? 'Đã duyệt thưởng' : adjustment < 0 ? 'Khoản khấu trừ' : 'Không phát sinh'}
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
              <h3>Lịch sử bảng lương các kỳ</h3>
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

          <div className="my-payroll__table-container">
            <table className="my-payroll__table">
              <thead>
                <tr>
                  <th>Kỳ lương</th>
                  <th className="is-num">Lương CB</th>
                  <th className="is-num">Khoán việc</th>
                  <th className="is-num">Điều chỉnh</th>
                  <th className="is-num">Tổng thực nhận</th>
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
                      title="Bấm để xem chi tiết kỳ này ở 4 thẻ trên"
                    >
                      <td>
                        <div className="my-payroll__period-cell">
                          <strong>{formatMonth(h.month)}</strong>
                          {h.is_current ? (
                            <span className="my-payroll__tag-curr">Kỳ này</span>
                          ) : h.status === 'Paid' ? (
                            <span className="my-payroll__tag-paid">Đã chi trả</span>
                          ) : (
                            <span className="my-payroll__tag-locked">Đã chốt</span>
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

          {/* Info Tip Banner bên trong Card */}
          <div className="my-payroll__info-tip">
            <div className="my-payroll__info-tip-icon">
              <HelpCircle size={15} />
            </div>
            <div className="my-payroll__info-tip-content">
              <span>Cần giải đáp thắc mắc về số liệu bảng lương?</span>
              <p>Vui lòng liên hệ trực tiếp <strong>Giám đốc</strong> hoặc <strong>bộ phận Kế toán</strong> để được hỗ trợ đối soát.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
