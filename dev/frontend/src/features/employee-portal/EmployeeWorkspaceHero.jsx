import { UserCheck } from 'lucide-react'
import AvatarImage from '../../components/AvatarImage'

export default function EmployeeWorkspaceHero({ employee }) {
  const active = employee.is_active !== false
  const name = employee.full_name || 'nhân viên'

  return <section className="employee-workspace-hero">
    <div className="employee-workspace-hero__identity">
      {/* Nhân viên đã tải ảnh đại diện thì hiện ảnh, không dùng biểu tượng chung chung. */}
      <AvatarImage
        className="employee-workspace-hero__avatar employee-workspace-hero__avatar--img"
        fallbackClassName="employee-workspace-hero__avatar"
        src={employee.avatar_url}
        name={name}
      />
      <div>
        <h1>Chào buổi sáng, {name}</h1>
        <p><span className={active ? 'is-online' : 'is-inactive'} />Trạng thái: {active ? 'Đang làm việc (Online)' : 'Không hoạt động'} - {employee.job_title || 'Chưa có dữ liệu'}</p>
      </div>
    </div>
    <button type="button" className="employee-workspace-hero__checkin" disabled title="Chưa có chức năng chấm công trực tiếp">
      <UserCheck size={17} />Check-out / Đã Check-in
    </button>
  </section>
}
