import React, { useState } from 'react';
import { BookOpen, Building2, Users } from 'lucide-react';
import { SubTabs } from '../components/ui';
import EmployeeDirectory from '../features/hr/EmployeeDirectory';
import DepartmentManagement from '../features/hr/DepartmentManagement';
import Wiki from './Wiki';

const HR_TABS = [
  { id: 'employees', label: 'Danh sách nhân sự', icon: <Users size={16} /> },
  { id: 'departments', label: 'Phòng ban', icon: <Building2 size={16} /> },
  { id: 'wiki', label: 'Đào Tạo & ISO', icon: <BookOpen size={16} /> },
];

export default function HumanResources({ user }) {
  const isDirector = Boolean(user?.is_director || user?.username === 'admin' || user?.role_name === 'admin');
  const canViewHr = user?.permissions?.hr === true;
  const canViewWiki = user?.permissions?.wiki === true;

  const visibleTabs = HR_TABS.filter(tab => {
    if (tab.id === 'employees') return canViewHr;
    if (tab.id === 'departments') return canViewHr || isDirector;
    if (tab.id === 'wiki') return canViewWiki;
    return true;
  });

  const defaultTab = canViewHr ? 'employees' : (canViewWiki ? 'wiki' : (isDirector ? 'departments' : 'employees'));
  const [activeTab, setActiveTab] = useState(defaultTab);

  const currentTab = visibleTabs.some(t => t.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id || defaultTab);

  return (
    <section className="tab-pane active hr-page" id="tab-nhansu">
      <header className="contract-pane-title">
        <div>
          <Users size={20} style={{ color: 'var(--orange-500)' }} />
          <span>Nhân Sự & Đào Tạo</span>
        </div>
      </header>
      <div className="hr-page__tabs">
        <SubTabs active={currentTab} onChange={setActiveTab} tabs={visibleTabs} />
      </div>
      <div className="hr-page__content">
        {currentTab === 'employees' && canViewHr && <EmployeeDirectory />}
        {currentTab === 'departments' && (canViewHr || isDirector) && (
          <DepartmentManagement user={user} isDirector={isDirector} />
        )}
        {currentTab === 'wiki' && canViewWiki && <Wiki user={user} isDirector={isDirector} />}
      </div>
    </section>
  );
}
