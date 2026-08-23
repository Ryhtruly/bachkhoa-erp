import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

describe('Modal theme styles', () => {
  it('gives the shared modal a dark surface and border in dark mode', () => {
    const darkModalRule = stylesheet.match(
      /\[data-theme=['"]dark['"]\]\s+\.modal\s*\{([^}]*)\}/,
    )?.[1]

    expect(darkModalRule).toBeDefined()
    expect(darkModalRule).toMatch(/\bbackground\s*:\s*var\(--bg-card\)\s*;/)
    expect(darkModalRule).toMatch(/\bborder\s*:\s*1px\s+solid\s+var\(--border-default\)\s*;/)
  })
})
