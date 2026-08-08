import { BookOpen, CalendarCheck2, FolderOpen, Link2, Megaphone, Plus, Quote, UsersRound } from 'lucide-react'

function Panel({ title, icon: Icon, children }) {
  return <section className="employee-workspace-panel">
    <h2><Icon size={18} />{title}</h2>
    {children}
  </section>
}

function EmptyState() {
  return <p className="employee-workspace-panel__empty">Chưa có dữ liệu</p>
}

export default function EmployeeWorkspaceSidebar() {
  return <aside className="employee-workspace-sidebar">
    <Panel title="Thông tin nghỉ phép" icon={CalendarCheck2}>
      <p className="employee-workspace-panel__eyebrow">Phép năm còn lại</p>
      <strong className="employee-workspace-panel__leave-value">Chưa có dữ liệu</strong>
      <button type="button" className="employee-workspace-panel__leave-action" disabled title="Chưa có chức năng tạo đơn nghỉ phép">
        Tạo đơn nghỉ phép <Plus size={16} />
      </button>
    </Panel>

    <Panel title="Tin tức & Thông báo" icon={Megaphone}><EmptyState /></Panel>

    <section className="employee-workspace-quote">
      <Quote size={22} aria-hidden="true" />
      <p>Chưa có dữ liệu</p>
    </section>

    <Panel title="Tài liệu dự án gần đây" icon={FolderOpen}><EmptyState /></Panel>

    <Panel title="Liên kết nhanh" icon={Link2}>
      <div className="employee-workspace-panel__links">
        <button type="button" disabled title="Chưa có dữ liệu sổ tay nhân viên"><BookOpen size={20} /><span>Sổ tay NV</span></button>
        <button type="button" disabled title="Chưa có dữ liệu sơ đồ tổ chức"><UsersRound size={20} /><span>Sơ đồ TC</span></button>
      </div>
    </Panel>
  </aside>
}
