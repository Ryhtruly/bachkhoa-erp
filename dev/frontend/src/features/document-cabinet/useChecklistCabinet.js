import { useCallback, useEffect, useState } from 'react'

import { apiFetch, peekApiCache } from '../../lib/api'

const cabinetCache = new Map()

export default function useChecklistCabinet({ contractId, serviceLineId, fallbackToTemplates = false }) {
  const cacheKey = `${contractId}:${serviceLineId}`

  const resolveFromPeek = useCallback(() => {
    if (!contractId || !serviceLineId) return null
    if (cabinetCache.has(cacheKey)) return cabinetCache.get(cacheKey)
    if (typeof peekApiCache === 'function') {
      const path = `/api/document-register/register?contract_id=${encodeURIComponent(contractId)}&service_line_id=${encodeURIComponent(serviceLineId)}`
      const peeked = peekApiCache(path)
      const checklistCabinet = peeked?.checklist_cabinet_by_node
      const fallbackCabinet = peeked?.cabinet_by_node
      if (Array.isArray(checklistCabinet) && checklistCabinet.length > 0) {
        cabinetCache.set(cacheKey, checklistCabinet)
        return checklistCabinet
      }
      if (fallbackToTemplates && Array.isArray(fallbackCabinet) && fallbackCabinet.length > 0) {
        cabinetCache.set(cacheKey, fallbackCabinet)
        return fallbackCabinet
      }
    }
    return null
  }, [cacheKey, contractId, fallbackToTemplates, serviceLineId])

  const [groups, setGroups] = useState(() => resolveFromPeek())
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = resolveFromPeek()
    if (cached) {
      setGroups(cached)
      setError('')
    }
  }, [resolveFromPeek])

  const reload = useCallback(async () => {
    if (!contractId || !serviceLineId) {
      setGroups([])
      setError(!serviceLineId && contractId ? 'Chưa xác định hạng mục của tủ hồ sơ.' : '')
      return
    }
    setError('')
    try {
      const response = await apiFetch(
        `/api/document-register/register?contract_id=${encodeURIComponent(contractId)}`
        + `&service_line_id=${encodeURIComponent(serviceLineId)}`,
      )
      const checklistCabinet = response?.checklist_cabinet_by_node
      const fallbackCabinet = response?.cabinet_by_node
      let resolved = []
      if (Array.isArray(checklistCabinet) && checklistCabinet.length > 0) {
        resolved = checklistCabinet
      } else if (fallbackToTemplates && Array.isArray(fallbackCabinet) && fallbackCabinet.length > 0) {
        resolved = fallbackCabinet
      }
      cabinetCache.set(cacheKey, resolved)
      setGroups(resolved)
    } catch (loadError) {
      setGroups([])
      setError(loadError?.message || 'Không mở được tủ hồ sơ.')
    }
  }, [cacheKey, contractId, serviceLineId, fallbackToTemplates])

  useEffect(() => { reload() }, [reload])

  return { groups, loading: groups === null, error, reload }
}
