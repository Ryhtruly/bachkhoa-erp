import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'
import { clearApiCache } from '../lib/api'

configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  clearApiCache()
})

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

