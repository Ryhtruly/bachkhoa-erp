import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import CustomerDirectory from './pages/CustomerDirectory';
import Tasks from './pages/Tasks';
import LegalSubmissions from './pages/LegalSubmissions';
import Settings from './pages/Settings';
import Contracts from './pages/Contracts';
import Cashflow from './pages/Cashflow';
import KPI from './pages/KPI';
import HumanResources from './pages/HumanResources';
import ContractTimeline from './pages/ContractTimeline';
import ApprovalQueue from './features/approvals/ApprovalQueue';
import DocumentTemplateSettings from './features/document-register/DocumentTemplateSettings';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import ChatWidget from './components/ChatWidget';
import EmployeePortalDashboard from './features/employee-portal/EmployeePortalDashboard';
import MyPayroll from './features/employee-portal/MyPayroll';
import { apiFetch, clearAccessToken } from './lib/api';
import { xinPhepRoiDi } from './lib/canhBaoChuaLuu';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [workspace, setWorkspace] = useState('management');
  const [profile, setProfile] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(localStorage.getItem('bachkhoa_access_token')));
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogin = (token, initialUser) => {
    localStorage.setItem('bachkhoa_access_token', token);
    if (initialUser && initialUser.username) {
      setProfile(initialUser);
      setWorkspace(initialUser.default_workspace === 'employee' ? 'employee' : 'management');
      if (initialUser.default_workspace !== 'employee' && initialUser.username !== 'admin') {
        setActiveTab(initialUser.permissions?.finance ? 'cashflow' : 'contracts');
      }
      setSessionLoading(false);
    } else {
      setSessionLoading(true);
    }
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
    if (!loggedIn) {
      setSessionLoading(false);
      return undefined;
    }
    let mounted = true;

    // Safety timeout: auto logout after 7s if /api/auth/me hangs
    const safetyTimer = setTimeout(() => {
      if (mounted && sessionLoading) {
        console.warn('Authentication verification timed out.');
        handleLogout();
      }
    }, 7000);

    apiFetch('/api/auth/me', { timeout: 6000 })
      .then((user) => {
        if (!mounted) return;
        setProfile(user);
        setWorkspace(user.default_workspace === 'employee' ? 'employee' : 'management');
        if (user.default_workspace !== 'employee' && user.username !== 'admin') {
          setActiveTab(user.permissions?.finance ? 'cashflow' : 'contracts');
        }
      })
      .catch((err) => {
        console.error('Session validation error:', err);
        if (mounted) handleLogout();
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        if (mounted) setSessionLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
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

  useEffect(() => {
    const navigateFromFeature = (event) => {
      if (event.detail?.tab === 'cashflow') setActiveTab('cashflow');
    };
    window.addEventListener('app:navigate', navigateFromFeature);
    return () => window.removeEventListener('app:navigate', navigateFromFeature);
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

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  if (sessionLoading) {
    return (
      <div className="app-session-loader">
        <div className="app-session-loader__box">
          <div className="app-session-loader__spinner" />
          <h3 className="app-session-loader__title">Đang xác thực phiên làm việc...</h3>
          <p className="app-session-loader__sub">Hệ thống đang kiểm tra phiên đăng nhập và tải quyền người dùng.</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 18 }}
            onClick={handleLogout}
          >
            Đăng nhập lại
          </button>
        </div>
      </div>
    );
  }

  const employeeMode = workspace === 'employee';
  const permissions = profile?.permissions || {};
  const isDirector = Boolean(profile?.is_director || profile?.username === 'admin' || profile?.role_name === 'admin');

  // permission: tab chỉ được render khi có quyền đọc tài nguyên tương ứng.
  const TABS = [
    { key: 'dashboard', Component: Dashboard, permission: 'finance', directorOnly: true, props: { user: profile, isDirector } },
    { key: 'crm', Component: CRM, permission: 'crm', props: { user: profile, isDirector } },
    { key: 'customers', Component: CustomerDirectory, permission: 'customer', props: { isDirector } },
    { key: 'tasks', Component: Tasks, permission: 'survey_record', props: { user: profile, isDirector } },
    { key: 'legal', Component: LegalSubmissions, permission: 'legal_submission', props: { user: profile, isDirector } },
    { key: 'settings', Component: Settings, permission: 'settings', directorOnly: true, props: { user: profile, isDirector } },
    { key: 'contracts', Component: Contracts, permission: 'contract', props: { user: profile, isDirector } },
    { key: 'timeline', Component: ContractTimeline, directorOnly: true, props: { user: profile, isDirector } },
    { key: 'approvals', Component: ApprovalQueue, directorOnly: true, props: {} },
    { key: 'doc-templates', Component: DocumentTemplateSettings, directorOnly: true, props: {} },
    { key: 'cashflow', Component: Cashflow, permission: 'finance', props: { landing: isDirector ? undefined : 'debt-collection', user: profile, isDirector } },
    { key: 'kpi', Component: KPI, permission: 'hr', directorOnly: true, props: { user: profile, isDirector } },
    { key: 'wiki', Component: HumanResources, permission: 'hr', props: { user: profile, isDirector } },
  ];

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

  // Bấm sang tab khác khi sơ đồ quy trình còn thay đổi chưa lưu thì hỏi trước.
  // Màn nào đang giữ dữ liệu dở tự đăng ký chốt chặn (xem lib/canhBaoChuaLuu).
  const doiTab = async (tab) => {
    if (tab === activeTab) { setActiveTab(tab); return; }
    if (await xinPhepRoiDi()) setActiveTab(tab);
  };

  const handleNotificationNavigate = async (item) => {
    // Bấm thông báo cũng là rời khỏi màn đang mở — hỏi y như bấm đổi tab.
    if (!(await xinPhepRoiDi())) return;
    // Phiếu chờ duyệt nằm bên Thu Chi, không nằm trong sơ đồ quy trình —
    // đưa giám đốc thẳng tới đúng phiếu để bấm duyệt.
    if (item.type === 'cashflow_approval') {
      setActiveTab('cashflow');
      window.dispatchEvent(new CustomEvent('bachkhoa:open-cashflow-voucher', {
        detail: { voucherId: item.voucher_id, nonce: Date.now() },
      }));
      return;
    }
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
            setActiveTab={doiTab}
            mode={workspace}
            permissions={permissions}
            isDirector={isDirector}
          />
          <main className={`main${activeTab === 'contracts' ? ' main--contract' : ''}${activeTab === 'timeline' ? ' main--timeline' : ''}${activeTab === 'wiki' ? ' main--hr' : ''}${['tasks', 'legal', 'customers', 'doc-templates'].includes(activeTab) ? ' main--list' : ''}${employeeTab === 'employee-dashboard' ? ' main--employee' : ''}`}>
            {(employeeMode ? allowedEmployeeTabs : allowedTabs).map(({ key, Component, props }) => (
              <div key={key} style={{ display: (employeeMode ? employeeTab : activeTab) === key ? 'block' : 'none', minHeight: '100%' }}>
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
