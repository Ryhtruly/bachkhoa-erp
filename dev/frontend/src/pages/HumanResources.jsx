import React, { useState } from 'react';
import { BookOpen, Users } from 'lucide-react';
import { SubTabs } from '../components/ui';
import EmployeeDirectory from '../features/hr/EmployeeDirectory';
import Wiki from './Wiki';

const HR_TABS = [
  { id: 'employees', label: 'Danh sách nhân sự', icon: <Users size={16} /> },
  { id: 'wiki', label: 'Đào Tạo & ISO', icon: <BookOpen size={16} /> },
];

export default function HumanResources({ user }) {
  const canViewHr = user?.permissions?.hr === true;
  const canViewWiki = user?.permissions?.wiki === true;

  const visibleTabs = HR_TABS.filter(tab => {
    if (tab.id === 'employees') return canViewHr;
    if (tab.id === 'wiki') return canViewWiki;
    return true;
  });

  const defaultTab = canViewHr ? 'employees' : (canViewWiki ? 'wiki' : 'employees');
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
        {currentTab === 'wiki' && canViewWiki && <Wiki />}
      </div>
    </section>
  );
}
