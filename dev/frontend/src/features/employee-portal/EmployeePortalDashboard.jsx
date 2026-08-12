import { useCallback, useEffect, useState } from 'react'

import { apiFetch } from '../../lib/api'
import EmployeeWorkspaceCalendar from './EmployeeWorkspaceCalendar'
import EmployeeWorkspaceHero from './EmployeeWorkspaceHero'
import EmployeeWorkspaceSidebar from './EmployeeWorkspaceSidebar'
import './employeePortal.css'

export default function EmployeePortalDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const loadProfile = useCallback((showError = false) => {
    return apiFetch('/api/employee-portal/me')
      .then((payload) => setData(payload))
      .catch((requestError) => {
        // Poll ngầm: bỏ qua lỗi thoáng qua, giữ nguyên dữ liệu đang hiện, không làm gián đoạn màn hình.
        if (showError) setError(requestError.message || 'Không thể tải dashboard.')
      })
  }, [])

  useEffect(() => {
    loadProfile(true)
    const pollId = setInterval(() => loadProfile(false), 8000)
    return () => clearInterval(pollId)
  }, [loadProfile])

  if (error) return <p className="employee-portal__state employee-portal__state--error">{error}</p>
  if (!data) return <p className="employee-portal__state">Đang tải dashboard...</p>

  return <main className="employee-portal employee-workspace">
    <EmployeeWorkspaceHero employee={data.employee} />
    <EmployeeWorkspaceCalendar tasks={data.tasks} onRefresh={loadProfile} />
    <EmployeeWorkspaceSidebar />
  </main>
}
