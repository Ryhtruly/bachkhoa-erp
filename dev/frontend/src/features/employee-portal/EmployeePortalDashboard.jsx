import { useCallback, useEffect, useState } from 'react'

import { apiFetch, getAccessToken } from '../../lib/api'
import EmployeeWorkspace from './EmployeeWorkspace'
import './employeePortal.css'
import './employeeWorkspace.css'

export default function EmployeePortalDashboard() {
  const [data, setData] = useState(null)
  const [taskPool, setTaskPool] = useState({ items: [], restrictions: {} })
  const [dailySummary, setDailySummary] = useState(null)
  const [completedItems, setCompletedItems] = useState({ count: 0, items: [] })
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState('')
  const [claimingKey, setClaimingKey] = useState('')

  const loadWorkspace = useCallback((showError = false) => {
    return Promise.all([
      apiFetch('/api/employee-portal/me'),
      apiFetch('/api/employee-portal/task-pool'),
      apiFetch('/api/employee-portal/daily-summary'),
      apiFetch('/api/employee-portal/completed-items'),
    ])
      .then(([profile, pool, summary, completed]) => {
        setData(profile)
        setTaskPool(pool?.items ? pool : { items: [], restrictions: {} })
        setDailySummary(summary)
        setCompletedItems(completed?.items ? completed : { count: 0, items: [] })
        setError(null)
      })
      .catch((requestError) => {
        if (showError) setError(requestError.message || 'Không thể tải dashboard.')
      })
  }, [])

  useEffect(() => {
    loadWorkspace(true)
  }, [loadWorkspace])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return undefined
    let stopped = false
    let retryId = null
    let controller = null

    const connect = async () => {
      controller = new AbortController()
      try {
        const response = await fetch('/api/employee-portal/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        })
        // 401/403/404 là lỗi vĩnh viễn: thử lại 1,5 giây một lần chỉ tạo ra
        // hàng trăm dòng lỗi mà không bao giờ thành công.
        if ([401, 403, 404].includes(response.status)) return
        if (!response.ok || !response.body) throw new Error('SSE unavailable')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!stopped) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const messages = buffer.split('\n\n')
          buffer = messages.pop() || ''
          if (messages.some(message => message.includes('event: employee-task-change'))) {
            loadWorkspace(false)
          }
        }
      } catch (streamError) {
        if (streamError.name !== 'AbortError' && !stopped) {
          retryId = window.setTimeout(connect, 1500)
        }
      }
    }
    connect()
    return () => {
      stopped = true
      controller?.abort()
      if (retryId) window.clearTimeout(retryId)
    }
  }, [loadWorkspace])

  const claimTask = useCallback(async (taskNodeId, roleCode) => {
    const key = `${taskNodeId}:${roleCode}`
    setClaimingKey(key)
    setActionError('')
    try {
      await apiFetch(`/api/employee-portal/tasks/${taskNodeId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_code: roleCode }),
      })
      await loadWorkspace(false)
    } catch (requestError) {
      setActionError(requestError.message || 'Không thể nhận công việc này.')
      // Nhận hụt gần như luôn là do người khác nhận trước. Không tải lại thì thẻ
      // đã mất vẫn nằm nguyên trên bể việc và nhân viên bấm lại lần hai, lần ba.
      await loadWorkspace(false)
    } finally {
      setClaimingKey('')
    }
  }, [loadWorkspace])

  const claimHelp = useCallback(async (requestId) => {
    setClaimingKey(`help:${requestId}`)
    setActionError('')
    try {
      await apiFetch(`/api/employee-portal/help-requests/${requestId}/claim`, { method: 'POST' })
      await loadWorkspace(false)
    } catch (requestError) {
      setActionError(requestError.message || 'Không nhận được việc này.')
      await loadWorkspace(false)
    } finally {
      setClaimingKey('')
    }
  }, [loadWorkspace])

  const yieldTask = useCallback(async (taskNodeId, nodeCode, nodeName) => {
    const reason = window.prompt(
      `Nhờ đồng đội làm hộ bước ${nodeCode} ${nodeName}?\n\n`
      + 'Lý do (đồng đội sẽ đọc trước khi nhận):'
    )
    if (!reason) return
    const raw = window.prompt(
      'Khoán đề xuất cho người nhận (không bắt buộc, Giám đốc chốt lại khi duyệt):',
      ''
    )
    const proposed = Number(String(raw || '').replace(/[^0-9]/g, ''))
    setActionError('')
    try {
      await apiFetch(`/api/employee-portal/tasks/${taskNodeId}/help-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, proposed_amount: proposed > 0 ? proposed : null }),
      })
      await loadWorkspace(false)
    } catch (requestError) {
      setActionError(requestError.message || 'Không đẩy được bước lên Bể việc.')
      // Nhờ hụt gần như luôn là do bước đã nằm sẵn trên Bể việc. Không tải lại
      // thì nút vẫn mời bấm tiếp và nhân viên ăn 409 lần nữa.
      await loadWorkspace(false)
    }
  }, [loadWorkspace])

  const cancelYield = useCallback(async (requestId, nodeCode) => {
    if (!window.confirm(`Rút bước ${nodeCode} khỏi Bể việc và tự làm tiếp?`)) return
    setActionError('')
    try {
      await apiFetch(`/api/employee-portal/help-requests/${requestId}/cancel`, { method: 'POST' })
      await loadWorkspace(false)
    } catch (requestError) {
      setActionError(requestError.message || 'Không rút lại được lời nhờ.')
      await loadWorkspace(false)
    }
  }, [loadWorkspace])

  if (error) return <p className="employee-portal__state employee-portal__state--error">{error}</p>
  if (!data) return <p className="employee-portal__state">Đang tải dashboard...</p>

  return <>
    {actionError && <div className="employee-workspace__action-error" role="alert">{actionError}</div>}
    <EmployeeWorkspace
      employee={data.employee}
      tasks={data.tasks}
      heldItems={data.held_items || []}
      taskPool={taskPool}
      dailySummary={dailySummary}
      completedItems={completedItems}
      claimingKey={claimingKey}
      onClaim={claimTask}
      onClaimHelp={claimHelp}
      onYield={yieldTask}
      onCancelYield={cancelYield}
      onRefresh={loadWorkspace}
    />
  </>
}
