import React from 'react';
import { LayoutDashboard, Filter, FolderKanban, FileCheck, FileText, Wallet, BarChart2, BookOpen, Settings2, ChartNoAxesGantt, Users } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, mode = 'management', permissions = {}, isDirector = false }) {
  // `permission` = tài nguyên phải có quyền đọc thì tab mới hiện.
  // Đây chỉ là dọn giao diện cho gọn; chặn thật nằm ở từng endpoint phía server.
  const menuItems = [
    // Tổng Quan là bức tranh tài chính TOÀN CÔNG TY — việc của giám đốc.
    // Kế toán mở lên chỉ thấy doanh thu, cơ cấu chi phí, KPI: không dùng được gì.
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard, permission: 'finance', directorOnly: true },
    { id: 'crm', label: 'CRM Bán Hàng', icon: Filter, permission: 'crm' },
    { id: 'customers', label: 'Khách Hàng', icon: Users, permission: 'customer' },
    { id: 'tasks', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban, permission: 'survey_record' },
    { id: 'legal', label: 'Hồ Sơ Pháp Lý', icon: FileCheck, permission: 'legal_submission' },
    { id: 'contracts', label: 'Hợp Đồng', icon: FileText, permission: 'contract' },
    { id: 'timeline', label: 'Quản Lý Timeline', icon: ChartNoAxesGantt, directorOnly: true },
    { id: 'cashflow', label: 'Thu Chi Sổ Quỹ', icon: Wallet, permission: 'finance' },
    { id: 'kpi', label: 'KPI Nhân Sự', icon: BarChart2, permission: 'hr', directorOnly: true },
    { id: 'wiki', label: 'Nhân Sự & Đào Tạo', icon: BookOpen, permission: 'hr' },
  ];

  // Nhân viên chỉ thấy đúng phần việc của mình: lịch trình, hồ sơ của PHÒNG mình
  // (lọc theo quyền, nên đo vẽ không thấy pháp lý và ngược lại), và lương cá nhân.
  const employeeMenuItems = [
    { id: 'employee-dashboard', label: 'Lịch trình', icon: LayoutDashboard },
    { id: 'tasks', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban, permission: 'survey_record' },
    { id: 'legal', label: 'Hồ Sơ Pháp Lý', icon: FileCheck, permission: 'legal_submission' },
    { id: 'payroll', label: 'Lương', icon: Wallet },
  ];

  const visibleMenuItems = (mode === 'employee' ? employeeMenuItems : menuItems)
    .filter(item => (
      (!item.permission || permissions[item.permission])
      && (!item.directorOnly || isDirector)
    ));

  return (
    <aside className="sidebar">
      <nav className="nav">
        <div className="nav-label">Điều hướng</div>
        {visibleMenuItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
        {mode === 'management' && <><div className="nav-label" style={{ marginTop: '16px' }}>Hệ thống</div><button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings2 size={18} /><span>Cấu Hình</span></button></>}
      </nav>
    </aside>
  );
}
