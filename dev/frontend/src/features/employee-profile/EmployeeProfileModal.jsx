import { useEffect, useState } from 'react'
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileText,
  Mail,
  UserRound,
} from 'lucide-react'

import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'
import {
  employeeStatus,
  formatDate,
  formatMoney,
  profileTabs,
} from './employeeProfileMappers'
import './employeeProfile.css'

function UnavailablePanel({ title, description }) {
  return (
    <section className="employee-profile__unavailable">
      <h3>{title}</h3>
      <strong>Chưa có dữ liệu</strong>
      {description && <p>{description}</p>}
    </section>
  )
}

function SectionTitle({ icon: Icon, children }) {
  return <h3 className="employee-profile__section-title"><Icon size={18} />{children}</h3>
}

function GeneralTab({ profile }) {
  const { employee, tasks, attendance } = profile
  const latestAttendance = attendance[0]

  return (
    <div className="employee-profile__general">
      <aside className="employee-profile__identity">
        <div className="employee-profile__avatar" aria-hidden="true"><UserRound size={44} /></div>
        <h2>{employee.full_name || 'Chưa có dữ liệu'}</h2>
        <p>{employee.job_title || 'Chưa có dữ liệu'}</p>
        <span className={employee.is_active ? 'employee-profile__status employee-profile__status--active' : 'employee-profile__status'}>
          {employeeStatus(employee)}
        </span>
        <dl>
          <div><dt><Mail size={15} /> Email</dt><dd>{employee.email || 'Chưa có dữ liệu'}</dd></div>
          <div><dt><BriefcaseBusiness size={15} /> Phòng ban</dt><dd>{employee.department || 'Chưa có dữ liệu'}</dd></div>
          <div><dt><CalendarDays size={15} /> Ngày vào làm</dt><dd>{formatDate(employee.join_date)}</dd></div>
        </dl>
      </aside>

      <div className="employee-profile__main-column">
        <div className="employee-profile__metrics">
          <section><span>Lương cơ bản</span><strong>{formatMoney(employee.base_salary)}</strong></section>
          <section><span>Công việc được giao</span><strong>{tasks.length}</strong></section>
          <section><span>Chấm công gần nhất</span><strong>{latestAttendance ? formatDate(latestAttendance.date) : 'Chưa có dữ liệu'}</strong></section>
        </div>

        <section className="employee-profile__panel">
          <SectionTitle icon={ClipboardList}>Công việc được phân công</SectionTitle>
          {tasks.length ? (
            <div className="employee-profile__table-wrap">
              <table>
                <thead><tr><th>Công việc</th><th>Trạng thái</th><th>Hạn xử lý</th></tr></thead>
                <tbody>{tasks.map((task) => (
                  <tr key={task.id}><td>{task.task_name || task.id}</td><td>{task.status || 'Chưa có dữ liệu'}</td><td>{formatDate(task.deadline)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <UnavailablePanel title="Công việc được phân công" description="Chưa có nhiệm vụ được gán cho nhân viên này." />}
        </section>
      </div>
    </div>
  )
}

function ResumeTab() {
  return (
    <div className="employee-profile__stack">
      <UnavailablePanel title="Thông tin định danh & pháp lý" description="Hệ thống chưa lưu CCCD, mã số thuế, bảo hiểm hoặc địa chỉ nhân viên." />
      <UnavailablePanel title="Kinh nghiệm công tác" description="Hệ thống chưa có dữ liệu quá trình công tác." />
      <UnavailablePanel title="Học vấn & liên hệ khẩn cấp" description="Hệ thống chưa có dữ liệu học vấn và người liên hệ khẩn cấp." />
    </div>
  )
}

function WorkTab({ profile }) {
  const { employee, tasks } = profile
  return (
    <div className="employee-profile__stack">
      <section className="employee-profile__panel">
        <SectionTitle icon={BriefcaseBusiness}>Chức danh & vị trí hiện tại</SectionTitle>
        <div className="employee-profile__details-grid">
          <div><span>Chức danh</span><strong>{employee.job_title || 'Chưa có dữ liệu'}</strong></div>
          <div><span>Phòng ban</span><strong>{employee.department || 'Chưa có dữ liệu'}</strong></div>
          <div><span>Ngày vào làm</span><strong>{formatDate(employee.join_date)}</strong></div>
          <div><span>Số nhiệm vụ</span><strong>{tasks.length}</strong></div>
        </div>
      </section>
      <UnavailablePanel title="Hợp đồng lao động" description="Hệ thống chưa có hồ sơ hợp đồng lao động hoặc tệp đính kèm nhân viên." />
    </div>
  )
}

function SalaryTab({ profile }) {
  const { employee, latest_payroll: payroll } = profile
  return (
    <div className="employee-profile__stack">
      <section className="employee-profile__panel">
        <SectionTitle icon={CircleDollarSign}>Tổng quan lương</SectionTitle>
        <div className="employee-profile__details-grid">
          <div><span>Lương cơ bản</span><strong>{formatMoney(employee.base_salary)}</strong></div>
          <div><span>Kỳ lương gần nhất</span><strong>{payroll ? formatDate(payroll.month) : 'Chưa có dữ liệu'}</strong></div>
          <div><span>Điểm KPI</span><strong>{payroll?.kpi_score ?? 'Chưa có dữ liệu'}</strong></div>
          <div><span>Tổng lương kỳ gần nhất</span><strong>{payroll ? formatMoney(payroll.total_salary) : 'Chưa có dữ liệu'}</strong></div>
        </div>
      </section>
      <UnavailablePanel title="Tài khoản nhận lương & phúc lợi" description="Hệ thống chưa có dữ liệu ngân hàng, bảo hiểm hoặc cấu phần phụ cấp." />
    </div>
  )
}

function LeaveTab({ profile }) {
  const { leave_records: leaveRecords, attendance } = profile
  return (
    <div className="employee-profile__stack">
      <section className="employee-profile__panel">
        <SectionTitle icon={CalendarDays}>Lịch sử nghỉ phép</SectionTitle>
        {leaveRecords.length ? <div className="employee-profile__table-wrap"><table><thead><tr><th>Loại nghỉ</th><th>Từ ngày</th><th>Đến ngày</th><th>Trạng thái</th></tr></thead><tbody>{leaveRecords.map((leave) => <tr key={leave.id}><td>{leave.leave_type || 'Chưa có dữ liệu'}</td><td>{formatDate(leave.start_date)}</td><td>{formatDate(leave.end_date)}</td><td>{leave.status || 'Chưa có dữ liệu'}</td></tr>)}</tbody></table></div> : <UnavailablePanel title="Lịch sử nghỉ phép" description="Chưa có bản ghi nghỉ phép." />}
      </section>
      <section className="employee-profile__panel">
        <SectionTitle icon={Clock3}>Lịch sử chấm công</SectionTitle>
        {attendance.length ? <div className="employee-profile__table-wrap"><table><thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th>Trạng thái</th></tr></thead><tbody>{attendance.map((record) => <tr key={record.id}><td>{formatDate(record.date)}</td><td>{record.check_in ? new Date(record.check_in).toLocaleTimeString('vi-VN') : 'Chưa có dữ liệu'}</td><td>{record.check_out ? new Date(record.check_out).toLocaleTimeString('vi-VN') : 'Chưa có dữ liệu'}</td><td>{record.status || 'Chưa có dữ liệu'}</td></tr>)}</tbody></table></div> : <UnavailablePanel title="Lịch sử chấm công" description="Chưa có bản ghi chấm công." />}
      </section>
    </div>
  )
}

export default function EmployeeProfileModal({ open, employeeId, onClose }) {
  const [activeTab, setActiveTab] = useState('general')
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !employeeId) return undefined
    let mounted = true
    setActiveTab('general')
    setLoading(true)
    setError(null)
    setProfile(null)
    apiFetch(`/api/employee-portal/employees/${employeeId}`)
      .then((payload) => mounted && setProfile(payload))
      .catch((requestError) => mounted && setError(requestError.message || 'Không thể tải hồ sơ nhân viên.'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [employeeId, open])

  let body = <p className="employee-profile__state">Đang tải hồ sơ...</p>
  if (error) body = <p className="employee-profile__state employee-profile__state--error">{error}</p>
  if (!loading && profile) {
    const tabs = {
      general: <GeneralTab profile={profile} />,
      resume: <ResumeTab />,
      work: <WorkTab profile={profile} />,
      salary: <SalaryTab profile={profile} />,
      leave: <LeaveTab profile={profile} />,
    }
    body = <><nav className="employee-profile__tabs" aria-label="Nội dung hồ sơ">{profileTabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>{tabs[activeTab]}</>
  }

  return (
    <Modal open={open} onClose={onClose} size="full" title={<span><FileText size={19} /> Hồ sơ nhân viên</span>} id="employee-profile-modal">
      <div className="employee-profile">{body}</div>
    </Modal>
  )
}
