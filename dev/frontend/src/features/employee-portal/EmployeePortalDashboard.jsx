import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../../lib/api'
import EmployeeWorkspace from './EmployeeWorkspace'
import './employeePortal.css'
import './employeeWorkspace.css'

const apiFetch = api.apiFetch
const getAccessToken = api.getAccessToken
let peekApiCache = () => undefined
let getLastLocalMutationTime = () => 0
try {
  if (typeof api.peekApiCache === 'function') peekApiCache = api.peekApiCache
} catch {}
try {
  if (typeof api.getLastLocalMutationTime === 'function') getLastLocalMutationTime = api.getLastLocalMutationTime
} catch {}

export default function EmployeePortalDashboard() {
  const [data, setData] = useState(() => peekApiCache('/api/employee-portal/me') || null)
  const [taskPool, setTaskPool] = useState(() => peekApiCache('/api/employee-portal/task-pool') || { items: [], restrictions: {} })
  const [dailySummary, setDailySummary] = useState(() => peekApiCache('/api/employee-portal/daily-summary') || null)
  const [completedItems, setCompletedItems] = useState(() => peekApiCache('/api/employee-portal/completed-items') || { count: 0, items: [] })
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState('')
  const [claimingKey, setClaimingKey] = useState('')
  const sseDebounceTimerRef = useRef(null)

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
            // Echo Cancellation: Nếu vừa có thao tác từ chính client này trong 1500ms thì bỏ qua
            if (Date.now() - getLastLocalMutationTime() < 1500) {
              continue
            }
            if (sseDebounceTimerRef.current) window.clearTimeout(sseDebounceTimerRef.current)
            sseDebounceTimerRef.current = window.setTimeout(() => {
              loadWorkspace(false)
            }, 400)
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

  const claimTask = useCallback(async (taskNodeId, roleCode, startNow = true) => {
    const key = `${taskNodeId}:${roleCode}`
    setClaimingKey(key)
    setActionError('')
    try {
      await apiFetch(`/api/employee-portal/tasks/${taskNodeId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_code: roleCode, start_now: startNow }),
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

  const claimCluster = useCallback(async (item, roleCode) => {
    const workflowInstanceId = item?.workflow_instance_id
    const clusterCode = item?.cluster_code
    // A node without a configured cluster uses the dynamic same-department
    // reservation path. Do not auto-start it: this is still a “Nhận trọn”
    // action.
    if (!workflowInstanceId || !clusterCode) {
      return claimTask(item?.id, roleCode, false)
    }

    const key = `cluster:${workflowInstanceId}:${clusterCode}`
    setClaimingKey(key)
    setActionError('')
    try {
      await apiFetch('/api/employee-portal/clusters/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_instance_id: workflowInstanceId,
          cluster_code: clusterCode,
        }),
      })
      await loadWorkspace(false)
    } catch (requestError) {
      setActionError(requestError.message || 'Không thể nhận trọn cụm công việc này.')
      await loadWorkspace(false)
    } finally {
      setClaimingKey('')
    }
  }, [claimTask, loadWorkspace])

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
      onClaimCluster={claimCluster}
      onClaimHelp={claimHelp}
      onYield={yieldTask}
      onCancelYield={cancelYield}
      onRefresh={loadWorkspace}
    />
  </>
}
