import React, { lazy, Suspense, useCallback, useEffect, useRef, useState, startTransition } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import ChatWidget from './components/ChatWidget';
import {
  clearAccessToken,
  getAccessToken,
  hasRefreshSessionHint,
  logoutSession,
  markRefreshSessionActive,
  refreshAccessToken,
  setAccessToken,
} from './lib/api';
import { validateSession } from './lib/sessionValidation';
import { requestNavigationPermission } from './lib/unsavedChangesGuard';
import { ToastProvider } from './contexts/ToastContext';
import { safeViewTransition } from './lib/viewTransition';
import TabSkeleton from './components/ui/TabSkeleton';
import './index.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRM = lazy(() => import('./pages/CRM'));
const CustomerDirectory = lazy(() => import('./pages/CustomerDirectory'));
const Tasks = lazy(() => import('./pages/Tasks'));
const LegalSubmissions = lazy(() => import('./pages/LegalSubmissions'));
const Settings = lazy(() => import('./pages/Settings'));
const Contracts = lazy(() => import('./pages/Contracts'));
const Cashflow = lazy(() => import('./pages/Cashflow'));
const KPI = lazy(() => import('./pages/KPI'));
const HumanResources = lazy(() => import('./pages/HumanResources'));
const ContractTimeline = lazy(() => import('./pages/ContractTimeline'));
const EmployeePortalDashboard = lazy(() => import('./features/employee-portal/EmployeePortalDashboard'));
const MyPayroll = lazy(() => import('./features/employee-portal/MyPayroll'));
const ApprovalQueue = lazy(() => import('./features/approvals/ApprovalQueue'));
const DocumentTemplateSettings = lazy(() => import('./features/document-register/DocumentTemplateSettings'));
const CustomerIntakePage = lazy(() => import('./pages/CustomerIntakePage'));

const SIDEBAR_COLLAPSED_KEY = 'bachkhoa_sidebar_collapsed';
const PUBLIC_PATHS = new Set(['/set-password', '/intake', '/yeu-cau-dich-vu']);
const NAVIGATION_TARGET_PERMISSIONS = {
  cashflow: 'finance',
  contracts: 'contract',
};

function ActiveTabScreen({ Component, componentProps, pendingNavigation, onNavigationDelivered }) {
  useEffect(() => {
    if (!pendingNavigation) return undefined;

    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(pendingNavigation.eventName, {
        detail: pendingNavigation.detail,
      }));
      onNavigationDelivered(pendingNavigation.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [onNavigationDelivered, pendingNavigation]);

  return <Component {...componentProps} />;
}

const MemoizedActiveTabScreen = React.memo(ActiveTabScreen, (previous, next) => {
  if (
    previous.Component !== next.Component
    || previous.pendingNavigation !== next.pendingNavigation
    || previous.onNavigationDelivered !== next.onNavigationDelivered
  ) {
    return false;
  }

  const previousKeys = Object.keys(previous.componentProps);
  const nextKeys = Object.keys(next.componentProps);
  return previousKeys.length === nextKeys.length
    && previousKeys.every(key => Object.is(previous.componentProps[key], next.componentProps[key]));
});

function App() {
  const isPublicPath = PUBLIC_PATHS.has(window.location.pathname);
  const isLoginPath = window.location.pathname === '/';
  const shouldBootstrapSession = !isPublicPath && (!isLoginPath || hasRefreshSessionHint());
  // The access token is intentionally memory-only. Bootstrap renews it from
  // the HttpOnly refresh cookie before asking /me after a page refresh.
  const [loggedIn, setLoggedIn] = useState(shouldBootstrapSession);
  const sessionActiveRef = useRef(loggedIn);
  const [workspace, setWorkspace] = useState('management');
  const [profile, setProfile] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(shouldBootstrapSession);
  const [sessionRetrying, setSessionRetrying] = useState(false);
  const [sessionValidationError, setSessionValidationError] = useState(null);
  const [sessionValidationAttempt, setSessionValidationAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  );
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [activeNavigation, setActiveNavigation] = useState(null);
  const navigationSequence = useRef(0);
  const activeNavigationRef = useRef(null);
  const queuedNavigationsRef = useRef([]);

  const canAccessNavigationTarget = useCallback((targetTab) => {
    if (!profile) return false;
    if (workspace === 'employee') return targetTab === 'employee-dashboard';

    const requiredPermission = NAVIGATION_TARGET_PERMISSIONS[targetTab];
    return Boolean(requiredPermission && profile.permissions?.[requiredPermission]);
  }, [profile, workspace]);

  const queueTabNavigation = useCallback((targetTab, eventName, detail) => {
    if (!sessionActiveRef.current || !canAccessNavigationTarget(targetTab)) return;

    navigationSequence.current += 1;
    const navigation = {
      id: navigationSequence.current,
      targetTab,
      eventName,
      detail,
    };

    if (activeNavigationRef.current) {
      queuedNavigationsRef.current.push(navigation);
      return;
    }

    activeNavigationRef.current = navigation;
    setActiveNavigation(navigation);
    setActiveTab(targetTab);
  }, [canAccessNavigationTarget]);

  const handleNavigationDelivered = useCallback((navigationId) => {
    if (activeNavigationRef.current?.id !== navigationId) return;

    const nextNavigation = queuedNavigationsRef.current.shift() || null;
    activeNavigationRef.current = nextNavigation;
    setActiveNavigation(nextNavigation);
    if (nextNavigation) setActiveTab(nextNavigation.targetTab);
  }, []);

  const clearNavigationQueue = useCallback(() => {
    queuedNavigationsRef.current = [];
    activeNavigationRef.current = null;
    setActiveNavigation(null);
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const handleLogin = (token, initialUser) => {
    clearNavigationQueue();
    sessionActiveRef.current = true;
    markRefreshSessionActive();
    setSessionValidationError(null);
    setSessionRetrying(false);
    setAccessToken(token);
    if (initialUser && initialUser.username) {
      setProfile(initialUser);
      const isEmp = initialUser.default_workspace === 'employee';
      setWorkspace(isEmp ? 'employee' : 'management');
      if (isEmp) {
        setActiveTab('employee-dashboard');
      } else if (initialUser.username === 'admin' || initialUser.is_director) {
        setActiveTab('dashboard');
      } else {
        setActiveTab(initialUser.permissions?.finance ? 'cashflow' : (initialUser.permissions?.contract ? 'contracts' : 'tasks'));
      }
      setSessionLoading(false);
    } else {
      setSessionLoading(true);
    }
    setLoggedIn(true);
  };

  const handleLogout = useCallback(() => {
    sessionActiveRef.current = false;
    clearNavigationQueue();
    void logoutSession().catch(() => {});
    clearAccessToken();
    setSidebarOverlayOpen(false);
    setWorkspace('management');
    setProfile(null);
    setSessionLoading(false);
    setSessionRetrying(false);
    setSessionValidationError(null);
    setLoggedIn(false);
  }, [clearNavigationQueue]);

  useEffect(() => {
    if (isPublicPath || !loggedIn) {
      setSessionLoading(false);
      setSessionRetrying(false);
      return undefined;
    }
    let mounted = true;

    setSessionValidationError(null);

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn('Authentication verification timed out; keeping the session for retry.');
        setSessionLoading(false);
        setSessionRetrying(false);
        setSessionValidationError(new Error('Không thể kết nối tới máy chủ để xác thực phiên.'));
      }
    }, 35000);

    validateSession({
      ensureAccessToken: () => getAccessToken() || refreshAccessToken(),
      onRetry: () => {
        if (mounted) setSessionRetrying(true);
      },
    })
      .then((user) => {
        if (!mounted) return;
        setSessionValidationError(null);
        setSessionRetrying(false);
        setProfile(user);
        const isEmp = user.default_workspace === 'employee';
        setWorkspace(isEmp ? 'employee' : 'management');
        if (isEmp) {
          setActiveTab('employee-dashboard');
        } else if (user.username === 'admin' || user.is_director) {
          setActiveTab('dashboard');
        } else {
          setActiveTab(user.permissions?.finance ? 'cashflow' : (user.permissions?.contract ? 'contracts' : 'tasks'));
        }
      })
      .catch((err) => {
        console.error('Session validation error:', err);
        if (!mounted) return;
        setSessionRetrying(false);
        if (err?.status === 401) {
          handleLogout();
          return;
        }
        setSessionValidationError(err);
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        if (mounted) {
          setSessionRetrying(false);
          setSessionLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, [handleLogout, isPublicPath, loggedIn, sessionValidationAttempt]);

  useEffect(() => {
    window.addEventListener('bachkhoa:unauthorized', handleLogout);
    return () => window.removeEventListener('bachkhoa:unauthorized', handleLogout);
  });

  useEffect(() => {
    const openTimelineNode = (event) => {
      queueTabNavigation('contracts', 'bachkhoa:navigate-to-node', event.detail);
    };
    window.addEventListener('bachkhoa:timeline-open-node', openTimelineNode);
    return () => window.removeEventListener('bachkhoa:timeline-open-node', openTimelineNode);
  }, [queueTabNavigation]);

  useEffect(() => {
    if (!sidebarOverlayOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarOverlayOpen(false);
    };

    document.body.classList.add('sidebar-overlay-active');
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('sidebar-overlay-active');
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [sidebarOverlayOpen]);

  useEffect(() => {
    const navigateFromFeature = (event) => {
      if (event.detail?.tab) setActiveTab(event.detail.tab);
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

  if (window.location.pathname === '/intake' || window.location.pathname === '/yeu-cau-dich-vu') {
    return (
      <Suspense fallback={<TabSkeleton />}>
        <CustomerIntakePage />
      </Suspense>
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
          <h3 className="app-session-loader__title">
            {sessionRetrying ? 'Máy chủ đang khởi động...' : 'Đang xác thực phiên làm việc...'}
          </h3>
          <p className="app-session-loader__sub">
            {sessionRetrying
              ? 'Đang thử kết nối lại. Phiên đăng nhập của bạn vẫn được giữ nguyên.'
              : 'Hệ thống đang kiểm tra phiên đăng nhập và tải quyền người dùng.'}
          </p>
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

  if (sessionValidationError && !profile) {
    return (
      <div className="app-session-loader">
        <div className="app-session-loader__box">
          <h3 className="app-session-loader__title">Chưa thể kết nối tới máy chủ</h3>
          <p className="app-session-loader__sub">
            Phiên đăng nhập vẫn được giữ lại. Bạn có thể thử kết nối lại sau khi backend khởi động xong.
          </p>
          <div className="app-session-loader__actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setSessionValidationError(null);
                setSessionRetrying(false);
                setSessionLoading(true);
                setSessionValidationAttempt(current => current + 1);
              }}
            >
              Thử kết nối lại
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
            >
              Đăng nhập lại
            </button>
          </div>
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

  const currentAllowedTabs = employeeMode ? allowedEmployeeTabs : allowedTabs;
  const effectiveTab = currentAllowedTabs.some(tab => tab.key === activeTab)
    ? activeTab
    : (currentAllowedTabs[0]?.key || (employeeMode ? 'employee-dashboard' : 'dashboard'));
  const activeTabConfig = currentAllowedTabs.find(tab => tab.key === effectiveTab);
  const ActiveTabComponent = activeTabConfig?.Component;

  // Ask for confirmation before leaving if active screen has unsaved changes.
  const handleTabChange = async (tab) => {
    if (tab === effectiveTab) { setActiveTab(tab); return; }
    if (await requestNavigationPermission()) {
      clearNavigationQueue();
      safeViewTransition(() => {
        startTransition(() => {
          setActiveTab(tab);
        });
      });
    }
  };

  const handleNotificationNavigate = async (item) => {
    if (!(await requestNavigationPermission())) return;
    if (item.type === 'cashflow_approval') {
      queueTabNavigation('cashflow', 'bachkhoa:open-cashflow-voucher', {
        voucherId: item.voucher_id,
        nonce: Date.now(),
      });
      return;
    }
    if (employeeMode) {
      queueTabNavigation('employee-dashboard', 'bachkhoa:open-employee-task', {
        taskNodeId: item.task_node_id,
        nonce: Date.now(),
      });
      return;
    }
    queueTabNavigation('contracts', 'bachkhoa:navigate-to-node', {
      contractId: item.contract_id,
      serviceLineId: item.service_line_id,
      nodeKey: item.node_key,
      taskNodeId: item.task_node_id,
      targetType: item.target_type || item.type,
      targetId: item.target_id || item.ref_id,
      nonce: Date.now(),
    });
  };

  return (
    <ToastProvider>
      <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}${sidebarOverlayOpen ? ' app--sidebar-overlay-open' : ''}`}>
        <TopHeader
          onLogout={handleLogout}
          user={profile}
          onNotificationNavigate={handleNotificationNavigate}
          sidebarOverlayOpen={sidebarOverlayOpen}
          onSidebarOverlayToggle={() => setSidebarOverlayOpen(current => !current)}
        />
        <div className="app-body">
          <Sidebar
            activeTab={effectiveTab}
            setActiveTab={handleTabChange}
            mode={workspace}
            permissions={permissions}
            isDirector={isDirector}
            collapsed={sidebarCollapsed}
            overlayOpen={sidebarOverlayOpen}
            onToggleCollapsed={toggleSidebarCollapsed}
            onRequestClose={() => setSidebarOverlayOpen(false)}
          />
<main className={`main${effectiveTab === 'contracts' ? ' main--contract' : ''}${effectiveTab === 'timeline' ? ' main--timeline' : ''}${effectiveTab === 'wiki' ? ' main--hr' : ''}${['tasks', 'legal', 'customers', 'doc-templates'].includes(effectiveTab) ? ' main--list' : ''}${effectiveTab === 'employee-dashboard' ? ' main--employee' : ''}`}>
            {ActiveTabComponent && (
              <Suspense fallback={<TabSkeleton label="Đang tải phân hệ..." />}>
                <MemoizedActiveTabScreen
                  key={effectiveTab}
                  Component={ActiveTabComponent}
                  componentProps={activeTabConfig.props || {}}
                  pendingNavigation={activeNavigation?.targetTab === effectiveTab ? activeNavigation : null}
                  onNavigationDelivered={handleNavigationDelivered}
                />
              </Suspense>
            )}
          </main>
        </div>
        {!employeeMode && <ChatWidget />}
      </div>
    </ToastProvider>
  );
}

export default App;
