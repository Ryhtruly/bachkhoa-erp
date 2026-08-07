import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Tasks from './pages/Tasks';
import LegalSubmissions from './pages/LegalSubmissions';
import Settings from './pages/Settings';
import Contracts from './pages/Contracts';
import Cashflow from './pages/Cashflow';
import Payroll from './pages/Payroll';
import KPI from './pages/KPI';
import Wiki from './pages/Wiki';
import Login from './pages/Login';
import ChatWidget from './components/ChatWidget';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogin = (token) => {
    localStorage.setItem('bachkhoa_access_token', token);
    setLoggedIn(true);
  };
  const handleLogout = () => {
    localStorage.removeItem('bachkhoa_access_token');
    setLoggedIn(false);
  };

  const TABS = [
    { key: 'dashboard', Component: Dashboard },
    { key: 'crm', Component: CRM },
    { key: 'tasks', Component: Tasks },
    { key: 'legal', Component: LegalSubmissions },
    { key: 'settings', Component: Settings },
    { key: 'contracts', Component: Contracts },
    { key: 'cashflow', Component: Cashflow },
    { key: 'payroll', Component: Payroll },
    { key: 'kpi', Component: KPI },
    { key: 'wiki', Component: Wiki },
  ];

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className={`main${activeTab === 'contracts' ? ' main--contract' : ''}`}>
          {activeTab !== 'contracts' && <TopHeader onLogout={handleLogout} />}
          {TABS.map(({ key, Component }) => (
            <div key={key} style={{ display: activeTab === key ? 'block' : 'none' }}>
              <Component />
            </div>
          ))}
        </main>
        <ChatWidget />
      </div>
    </ToastProvider>
  );
}

export default App;
