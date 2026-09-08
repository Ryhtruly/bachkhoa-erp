import React, { useState } from 'react';
import { BookOpen, Users } from 'lucide-react';
import { SubTabs } from '../components/ui';
import EmployeeDirectory from '../features/hr/EmployeeDirectory';
import Wiki from './Wiki';

const HR_TABS = [
  { id: 'employees', label: 'Danh sách nhân sự', icon: <Users size={16} /> },
  { id: 'wiki', label: 'Đào Tạo & ISO', icon: <BookOpen size={16} /> },
];

export default function HumanResources() {
  const [activeTab, setActiveTab] = useState('employees');

  return (
    <section className="tab-pane active hr-page" id="tab-nhansu">
      <header className="contract-pane-title">
        <div>
          <Users size={20} style={{ color: 'var(--orange-500)' }} />
          <span>Nhân Sự & Đào Tạo</span>
        </div>
      </header>
      <div className="hr-page__tabs">
        <SubTabs active={activeTab} onChange={setActiveTab} tabs={HR_TABS} />
      </div>
      <div className="hr-page__content">
        {activeTab === 'employees' && <EmployeeDirectory />}
        {activeTab === 'wiki' && <Wiki />}
      </div>
    </section>
  );
}
