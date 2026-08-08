import { useEffect, useState } from 'react'

import { apiFetch } from '../../lib/api'
import EmployeeWorkspaceCalendar from './EmployeeWorkspaceCalendar'
import EmployeeWorkspaceHero from './EmployeeWorkspaceHero'
import EmployeeWorkspaceSidebar from './EmployeeWorkspaceSidebar'
import './employeePortal.css'

export default function EmployeePortalDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    apiFetch('/api/employee-portal/me')
      .then((payload) => mounted && setData(payload))
      .catch((requestError) => mounted && setError(requestError.message || 'Không thể tải dashboard.'))
    return () => { mounted = false }
  }, [])

  if (error) return <p className="employee-portal__state employee-portal__state--error">{error}</p>
  if (!data) return <p className="employee-portal__state">Đang tải dashboard...</p>

  return <main className="employee-portal employee-workspace">
    <EmployeeWorkspaceHero employee={data.employee} />
    <EmployeeWorkspaceCalendar />
    <EmployeeWorkspaceSidebar />
  </main>
}
