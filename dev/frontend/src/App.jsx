import React, { useEffect, useState } from 'react';
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
import EmployeePortalDashboard from './features/employee-portal/EmployeePortalDashboard';
import { apiFetch, clearAccessToken } from './lib/api';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [workspace, setWorkspace] = useState('management');
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogin = (token) => {
    localStorage.setItem('bachkhoa_access_token', token);
    setSessionLoading(true);
    setLoggedIn(true);
  };
  const handleLogout = () => {
    clearAccessToken();
    setWorkspace('management');
    setSessionLoading(false);
    setLoggedIn(false);
  };

  useEffect(() => {
    if (!loggedIn) return undefined;
    let mounted = true;
    apiFetch('/api/auth/me')
      .then((user) => {
        if (!mounted) return;
        setWorkspace(user.default_workspace === 'employee' ? 'employee' : 'management');
      })
      .catch(() => mounted && handleLogout())
      .finally(() => mounted && setSessionLoading(false));
    return () => { mounted = false; };
  }, [loggedIn]);

  useEffect(() => {
    window.addEventListener('bachkhoa:unauthorized', handleLogout);
    return () => window.removeEventListener('bachkhoa:unauthorized', handleLogout);
  });

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

  if (sessionLoading) return <div className="app-loading">Đang xác thực phiên làm việc...</div>;

  const employeeMode = workspace === 'employee';

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar activeTab={employeeMode ? 'employee-dashboard' : activeTab} setActiveTab={setActiveTab} mode={workspace} />
        <main className={`main${activeTab === 'contracts' ? ' main--contract' : ''}`}>
          {activeTab !== 'contracts' && <TopHeader onLogout={handleLogout} />}
          {employeeMode ? <EmployeePortalDashboard /> : TABS.map(({ key, Component }) => (
            <div key={key} style={{ display: activeTab === key ? 'block' : 'none' }}>
              <Component />
            </div>
          ))}
        </main>
        {!employeeMode && <ChatWidget />}
      </div>
    </ToastProvider>
  );
}

export default App;
