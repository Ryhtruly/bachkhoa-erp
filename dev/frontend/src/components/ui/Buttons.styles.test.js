import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

describe('Shared destructive button styles', () => {
  it('defines a visible red surface for reject and cancel actions', () => {
    const dangerRule = stylesheet.match(/(?:^|\n)\.btn-danger\s*\{([^}]*)\}/)?.[1]

    expect(dangerRule).toBeDefined()
    expect(dangerRule).toMatch(/background\s*:\s*linear-gradient\([^;]+\);/)
    expect(dangerRule).toMatch(/color\s*:\s*#fff\s*;/)
    expect(dangerRule).toMatch(/border\s*:\s*none\s*;/)
  })

  it('keeps the danger action readable in dark mode', () => {
    const darkDangerRule = stylesheet.match(/\[data-theme=['"]dark['"]\]\s+\.btn-danger\s*\{([^}]*)\}/)?.[1]

    expect(darkDangerRule).toBeDefined()
    expect(darkDangerRule).toMatch(/background\s*:/)
    expect(darkDangerRule).toMatch(/color\s*:\s*#fff\s*;/)
  })
})
