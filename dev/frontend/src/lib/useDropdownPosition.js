import { useLayoutEffect, useState } from 'react'

const VIEWPORT_MARGIN = 12

// Tính vị trí fixed cho 1 dropdown, tự kẹp trong viewport (không tràn phải/trái/dưới).
// Ưu tiên căn phải theo trigger (giống hành vi cũ), lệch trái dần nếu không đủ chỗ.
export function useDropdownPosition(open, triggerRef, panelRef, panelWidth = 320) {
  const [style, setStyle] = useState(null)

  useLayoutEffect(() => {
    if (!open) return undefined

    const recalc = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const triggerRect = trigger.getBoundingClientRect()
      const width = panelRef.current?.offsetWidth || panelWidth
      const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
      const preferredLeft = triggerRect.right - width
      const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN))
      const top = triggerRect.bottom + 8
      setStyle({ position: 'fixed', top, left, width })
    }

    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [open, triggerRef, panelRef, panelWidth])

  return style
}
