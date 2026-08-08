import React from 'react';
import { LayoutDashboard, Filter, FolderKanban, FileCheck, FileText, Wallet, Coins, BarChart2, BookOpen, Settings2 } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, mode = 'management' }) {
  const menuItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM Bán Hàng', icon: Filter },
    { id: 'tasks', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban },
    { id: 'legal', label: 'Hồ Sơ Pháp Lý', icon: FileCheck },
    { id: 'contracts', label: 'Hợp Đồng', icon: FileText },
    { id: 'cashflow', label: 'Thu Chi Sổ Quỹ', icon: Wallet },
    { id: 'payroll', label: 'Lương Khoán 3P', icon: Coins },
    { id: 'kpi', label: 'KPI Nhân Sự', icon: BarChart2 },
    { id: 'wiki', label: 'Đào Tạo & ISO', icon: BookOpen },
  ];

  const visibleMenuItems = mode === 'employee'
    ? [{ id: 'employee-dashboard', label: 'Không gian nhân viên', icon: LayoutDashboard }]
    : menuItems;

  return (
    <aside className="sidebar">
      <div className="brand" style={{ padding: '22px 16px 28px 16px', gap: '8px' }}>
        <div className="brand-logo" style={{ width: '65px', height: '65px', background: 'transparent', boxShadow: 'none', flexShrink: 0 }}>
          <img src="/src/assets/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div className="brand-text" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/src/assets/TieuDe.png" alt="Title" style={{ height: '62px', maxWidth: '150px', objectFit: 'contain' }} />
        </div>
      </div>
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
      <div className="sidebar-footer">
        <div className="avatar">LD</div>
        <div className="info">
          <h4>Lê Văn Dựng</h4>
          <p>Giám đốc điều hành</p>
        </div>
        <div className="status-led"></div>
      </div>
    </aside>
  );
}
