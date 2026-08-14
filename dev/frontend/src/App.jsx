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
import KPI from './pages/KPI';
import HumanResources from './pages/HumanResources';
import ContractTimeline from './pages/ContractTimeline';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import ChatWidget from './components/ChatWidget';
import EmployeePortalDashboard from './features/employee-portal/EmployeePortalDashboard';
import MyPayroll from './features/employee-portal/MyPayroll';
import { apiFetch, clearAccessToken } from './lib/api';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [workspace, setWorkspace] = useState('management');
  const [profile, setProfile] = useState(null);
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
    setProfile(null);
    setSessionLoading(false);
    setLoggedIn(false);
  };

  useEffect(() => {
    if (!loggedIn) return undefined;
    let mounted = true;
    apiFetch('/api/auth/me')
      .then((user) => {
        if (!mounted) return;
        setProfile(user);
        setWorkspace(user.default_workspace === 'employee' ? 'employee' : 'management');
        // Mỗi vai vào thẳng màn hình việc của mình. Trước đây ai cũng rơi vào
        // Tổng Quan — bức tranh tài chính toàn công ty — nên kế toán đăng nhập
        // xong chỉ thấy doanh thu và KPI, không có gì để làm.
        if (user.default_workspace !== 'employee' && user.username !== 'admin') {
          setActiveTab(user.permissions?.finance ? 'cashflow' : 'contracts');
        }
      })
      .catch(() => mounted && handleLogout())
      .finally(() => mounted && setSessionLoading(false));
    return () => { mounted = false; };
  }, [loggedIn]);

  useEffect(() => {
    window.addEventListener('bachkhoa:unauthorized', handleLogout);
    return () => window.removeEventListener('bachkhoa:unauthorized', handleLogout);
  });

  useEffect(() => {
    const openTimelineNode = (event) => {
      setActiveTab('contracts');
      window.dispatchEvent(new CustomEvent('bachkhoa:navigate-to-node', { detail: event.detail }));
    };
    window.addEventListener('bachkhoa:timeline-open-node', openTimelineNode);
    return () => window.removeEventListener('bachkhoa:timeline-open-node', openTimelineNode);
  }, []);

  if (window.location.pathname === '/set-password') {
    return (
      <SetPassword
        onDone={(token) => {
          window.history.replaceState({}, '', '/');
          handleLogin(token);
        }}
      />
    );
  }

  // permission: tab chỉ được render khi có quyền đọc tài nguyên tương ứng.
  const TABS = [
    { key: 'dashboard', Component: Dashboard, permission: 'finance', props: { user: profile } },
    { key: 'crm', Component: CRM, permission: 'crm' },
    { key: 'tasks', Component: Tasks, permission: 'survey_record' },
    { key: 'legal', Component: LegalSubmissions, permission: 'legal_submission' },
    { key: 'settings', Component: Settings, permission: 'settings' },
    { key: 'contracts', Component: Contracts, permission: 'contract' },
    { key: 'timeline', Component: ContractTimeline, directorOnly: true },
    { key: 'cashflow', Component: Cashflow, permission: 'finance', props: { landing: profile?.username === 'admin' ? undefined : 'debt-collection' } },
    { key: 'kpi', Component: KPI, permission: 'hr' },
    { key: 'wiki', Component: HumanResources, permission: 'hr' },
  ];

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  if (sessionLoading) return <div className="app-loading">Đang xác thực phiên làm việc...</div>;

  const employeeMode = workspace === 'employee';
  const permissions = profile?.permissions || {};
  const isDirector = profile?.username === 'admin';
  const allowedTabs = TABS.filter(tab => (
    (!tab.permission || permissions[tab.permission])
    && (!tab.directorOnly || isDirector)
  ));

  // Nhân viên dùng bộ tab riêng: lịch trình, hồ sơ của phòng mình, lương cá nhân.
  const EMPLOYEE_TABS = [
    { key: 'employee-dashboard', Component: EmployeePortalDashboard },
    { key: 'tasks', Component: Tasks, permission: 'survey_record' },
    { key: 'legal', Component: LegalSubmissions, permission: 'legal_submission' },
    { key: 'payroll', Component: MyPayroll },
  ];
  const allowedEmployeeTabs = EMPLOYEE_TABS.filter(
    tab => !tab.permission || permissions[tab.permission]
  );
  const employeeTab = employeeMode && !allowedEmployeeTabs.some(tab => tab.key === activeTab)
    ? 'employee-dashboard'
    : activeTab;

  const handleNotificationNavigate = (item) => {
    // Nhân viên không có tab Hợp đồng (chỉ thấy không gian nhân viên) — phải mở thẳng
    // đúng công việc trong lịch làm việc, thay vì chuyển tab không tồn tại.
    if (employeeMode) {
      window.dispatchEvent(new CustomEvent('bachkhoa:open-employee-task', {
        detail: { taskNodeId: item.task_node_id, nonce: Date.now() },
      }));
      return;
    }
    setActiveTab('contracts');
    window.dispatchEvent(new CustomEvent('bachkhoa:navigate-to-node', {
      detail: {
        contractId: item.contract_id,
        serviceLineId: item.service_line_id,
        nodeKey: item.node_key,
        type: item.type,
        // nonce để bấm lại đúng thông báo cũ vẫn điều hướng được (giá trị luôn khác nhau).
        nonce: Date.now(),
      },
    }));
  };

  return (
    <ToastProvider>
      <div className="app">
        <TopHeader onLogout={handleLogout} user={profile} onNotificationNavigate={handleNotificationNavigate} />
        <div className="app-body">
          <Sidebar
            activeTab={employeeMode ? employeeTab : activeTab}
            setActiveTab={setActiveTab}
            mode={workspace}
            permissions={permissions}
            isDirector={isDirector}
          />
          <main className={`main${activeTab === 'contracts' ? ' main--contract' : ''}${activeTab === 'timeline' ? ' main--timeline' : ''}${activeTab === 'wiki' ? ' main--hr' : ''}${['tasks', 'legal'].includes(activeTab) ? ' main--list' : ''}`}>
            {(employeeMode ? allowedEmployeeTabs : allowedTabs).map(({ key, Component, props }) => (
              <div key={key} style={{ display: (employeeMode ? employeeTab : activeTab) === key ? 'block' : 'none' }}>
                <Component {...(props || {})} />
              </div>
            ))}
          </main>
        </div>
        {!employeeMode && <ChatWidget />}
      </div>
    </ToastProvider>
  );
}

export default App;
