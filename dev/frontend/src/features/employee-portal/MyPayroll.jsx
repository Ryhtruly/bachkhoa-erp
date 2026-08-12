import React, { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Landmark, ClipboardCheck } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import './myPayroll.css';

const formatVND = (value) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}₫`;

const formatMonth = (value) => {
  if (!value) return '';
  const [year, month] = value.split('-');
  return `Tháng ${Number(month)}/${year}`;
};

export default function MyPayroll() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/employee-portal/me')
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch(() => { if (!cancelled) setError('Không tải được dữ liệu lương'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="my-payroll__state">Đang tải…</div>;
  if (error) return <div className="my-payroll__state">{error}</div>;

  const payroll = profile?.latest_payroll;
  const employee = profile?.employee || {};

  if (!payroll) {
    return (
      <section className="my-payroll">
        <header className="my-payroll__heading">
          <h2><Wallet size={22} /> Lương của tôi</h2>
        </header>
        <div className="my-payroll__state">
          Chưa có dữ liệu lương cho kỳ này. Lương sẽ hiện khi bộ phận nhân sự thiết lập mức lương cơ bản.
        </div>
      </section>
    );
  }

  // Chỉ hiện dòng Khoán khi thực sự có phát sinh — nhân viên hưởng lương cơ bản
  // (phòng Pháp lý) nhìn thấy dòng "0₫" sẽ tưởng bị tính thiếu.
  const hasPiece = Number(payroll.piece_amount) > 0 || Number(payroll.tasks_completed) > 0;
  const adjustment = Number(payroll.adjustment_amount) || 0;

  return (
    <section className="my-payroll">
      <header className="my-payroll__heading">
        <div>
          <h2><Wallet size={22} /> Lương của tôi</h2>
          <p>{employee.full_name} · {employee.job_title || 'Chưa có chức danh'}</p>
        </div>
        <span className="my-payroll__period">{formatMonth(payroll.month)}</span>
      </header>

      <div className="my-payroll__total">
        <span>Tạm tính kỳ này</span>
        <strong>{formatVND(payroll.total_salary)}</strong>
        <small>Số liệu tạm tính, chốt lại khi kết thúc kỳ lương.</small>
      </div>

      <div className="my-payroll__breakdown">
        <div className="my-payroll__line">
          <span className="my-payroll__line-icon"><Landmark size={16} /></span>
          <div>
            <strong>Lương cơ bản</strong>
            <small>Theo mức lương đang áp dụng</small>
          </div>
          <b>{formatVND(payroll.base_salary)}</b>
        </div>

        {hasPiece && (
          <div className="my-payroll__line">
            <span className="my-payroll__line-icon"><ClipboardCheck size={16} /></span>
            <div>
              <strong>Lương khoán</strong>
              <small>{payroll.tasks_completed} việc đã được nghiệm thu</small>
            </div>
            <b>{formatVND(payroll.piece_amount)}</b>
          </div>
        )}

        {adjustment !== 0 && (
          <div className="my-payroll__line">
            <span className="my-payroll__line-icon"><TrendingUp size={16} /></span>
            <div>
              <strong>{adjustment > 0 ? 'Thưởng / Phụ cấp' : 'Khấu trừ'}</strong>
              <small>Khoản điều chỉnh đã được duyệt</small>
            </div>
            <b className={adjustment < 0 ? 'is-negative' : ''}>{formatVND(adjustment)}</b>
          </div>
        )}
      </div>

      <p className="my-payroll__note">
        Thắc mắc về số liệu, liên hệ quản lý trực tiếp hoặc bộ phận nhân sự.
      </p>
    </section>
  );
}
