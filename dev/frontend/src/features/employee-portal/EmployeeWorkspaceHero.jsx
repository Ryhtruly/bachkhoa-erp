import { useState } from 'react'
import { UserCheck, UserRound } from 'lucide-react'
import { avatarColorFor, avatarUrlFor, initialsOf } from '../../lib/avatar'

export default function EmployeeWorkspaceHero({ employee }) {
  const active = employee.is_active !== false
  const [imageFailed, setImageFailed] = useState(false)
  const avatarUrl = avatarUrlFor(employee.avatar_url)
  const name = employee.full_name || 'nhân viên'

  return <section className="employee-workspace-hero">
    <div className="employee-workspace-hero__identity">
      {/* Nhân viên đã tải ảnh đại diện thì hiện ảnh, không dùng biểu tượng chung chung. */}
      {avatarUrl && !imageFailed ? (
        <img className="employee-workspace-hero__avatar employee-workspace-hero__avatar--img"
          src={avatarUrl} alt={name} onError={() => setImageFailed(true)} />
      ) : (
        <div
          className="employee-workspace-hero__avatar"
          aria-label={`Ảnh đại diện dự phòng của ${name}`}
          style={{ background: avatarColorFor(name) }}
        >
          {imageFailed || !avatarUrl ? initialsOf(name) : <UserRound size={34} />}
        </div>
      )}
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
