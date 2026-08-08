import { UserCheck, UserRound } from 'lucide-react'

export default function EmployeeWorkspaceHero({ employee }) {
  const active = employee.is_active !== false

  return <section className="employee-workspace-hero">
    <div className="employee-workspace-hero__identity">
      <div className="employee-workspace-hero__avatar" aria-hidden="true"><UserRound size={34} /></div>
      <div>
        <h1>Chào buổi sáng, {employee.full_name || 'nhân viên'}</h1>
        <p><span className={active ? 'is-online' : 'is-inactive'} />Trạng thái: {active ? 'Đang làm việc (Online)' : 'Không hoạt động'} - {employee.job_title || 'Chưa có dữ liệu'}</p>
      </div>
    </div>
    <button type="button" className="employee-workspace-hero__checkin" disabled title="Chưa có chức năng chấm công trực tiếp">
      <UserCheck size={17} />Check-out / Đã Check-in
    </button>
  </section>
}
