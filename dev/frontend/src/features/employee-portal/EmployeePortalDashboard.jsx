import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, FileText, Landmark, Megaphone } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { displayDate, displayMoney } from './employeePortalMappers'
import './employeePortal.css'

function Unavailable({ title, icon: Icon }) {
  return <section className="employee-portal__unavailable"><h3><Icon size={18} />{title}</h3><strong>Chưa có dữ liệu</strong></section>
}

export default function EmployeePortalDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let mounted = true
    apiFetch('/api/employee-portal/me').then((payload) => mounted && setData(payload)).catch((requestError) => mounted && setError(requestError.message || 'Không thể tải dashboard.'))
    return () => { mounted = false }
  }, [])
  if (error) return <p className="employee-portal__state employee-portal__state--error">{error}</p>
  if (!data) return <p className="employee-portal__state">Đang tải dashboard...</p>
  const { employee, tasks, leave_records: leaveRecords, attendance, latest_payroll: payroll } = data
  return <div className="employee-portal">
    <section className="employee-portal__intro"><div><p>Không gian làm việc</p><h1>Chào {employee.full_name}</h1><span>{employee.job_title || 'Chưa có dữ liệu'} · {employee.department || 'Chưa có dữ liệu'}</span></div><div><span>Lương kỳ gần nhất</span><strong>{payroll ? displayMoney(payroll.total_salary) : 'Chưa có dữ liệu'}</strong></div></section>
    <div className="employee-portal__grid">
      <section className="employee-portal__panel employee-portal__panel--wide"><h2><ClipboardList size={19} />Công việc của tôi</h2>{tasks.length ? <div className="employee-portal__list">{tasks.map((task) => <article key={task.id}><strong>{task.task_name || task.id}</strong><span>{task.status || 'Chưa có dữ liệu'} · Hạn {displayDate(task.deadline)}</span></article>)}</div> : <strong>Chưa có dữ liệu</strong>}</section>
      <section className="employee-portal__panel"><h2><CalendarDays size={19} />Chấm công</h2>{attendance.length ? <article><strong>{displayDate(attendance[0].date)}</strong><span>{attendance[0].status || 'Chưa có dữ liệu'}</span></article> : <strong>Chưa có dữ liệu</strong>}</section>
      <section className="employee-portal__panel"><h2><CalendarDays size={19} />Nghỉ phép</h2>{leaveRecords.length ? <article><strong>{leaveRecords[0].leave_type || 'Chưa có dữ liệu'}</strong><span>{leaveRecords[0].status || 'Chưa có dữ liệu'} · {displayDate(leaveRecords[0].start_date)}</span></article> : <strong>Chưa có dữ liệu</strong>}</section>
      <Unavailable title="Lịch làm việc tuần" icon={CalendarDays} />
      <Unavailable title="Thông báo" icon={Megaphone} />
      <Unavailable title="Tài liệu dự án" icon={FileText} />
      <Unavailable title="Sổ tay nhân viên" icon={Landmark} />
    </div>
  </div>
}
