import React from 'react';
import { COMPANY_IDENTITY } from '../../lib/companyIdentity';

const contractStatusLabels = { Probation: 'Thử việc', Official: 'Chính thức', Terminated: 'Đã nghỉ' };
const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const formatDate = value => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : '—';
const formatMoney = value => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}₫`;

export default function EmployeePrintProfile({ employee, documentRef }) {
  if (!employee) return null;

  const fields = [
    ['Mã nhân sự', employee.id],
    ['Phòng ban', employee.department],
    ['Chức danh', employee.job_title],
    ['Email', employee.email],
    ['Số điện thoại', employee.phone],
    ['Loại hợp đồng', contractStatusLabels[employee.contract_status] || employee.contract_status],
    ['Trạng thái làm việc', employee.is_active ? 'Đang làm việc' : 'Ngừng hoạt động'],
    ['Ngày vào làm', formatDate(employee.join_date)],
    ['Lương cơ bản', formatMoney(employee.base_salary)],
    ['Giới tính', genderLabels[employee.gender] || employee.gender],
    ['Ngày sinh', formatDate(employee.date_of_birth)],
    ['Nơi sinh', employee.place_of_birth],
  ];

  return (
    <article ref={documentRef} className="employee-print-profile">
      <header>
        <div>
          <strong>{COMPANY_IDENTITY.legalName}</strong>
          <span>{COMPANY_IDENTITY.address}</span>
          <span>Mã số thuế: {COMPANY_IDENTITY.taxCode} · Điện thoại: {COMPANY_IDENTITY.phone}</span>
        </div>
        <div>Ngày in: <span data-print-timestamp>—</span></div>
      </header>

      <section className="employee-print-profile__title">
        <h1>Hồ sơ nhân sự</h1>
        <h2>{employee.full_name}</h2>
        <p>{employee.job_title || 'Nhân viên'} · {employee.department || 'Chưa cập nhật phòng ban'}</p>
      </section>

      <section className="employee-print-profile__grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || '—'}</strong>
          </div>
        ))}
      </section>

      <footer>
        <div><strong>Người lập</strong><span>(Ký, họ tên)</span></div>
        <div><strong>Nhân viên</strong><span>(Ký, họ tên)</span></div>
        <div><strong>Giám đốc</strong><span>(Ký, họ tên, đóng dấu)</span></div>
      </footer>
    </article>
  );
}
