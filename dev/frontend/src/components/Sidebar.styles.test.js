import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

function mountStyles() {
  const style = document.createElement('style')
  style.dataset.testStyles = 'sidebar'
  style.textContent = stylesheet
  document.head.append(style)
}

afterEach(() => {
  document.head.querySelector('[data-test-styles="sidebar"]')?.remove()
  document.body.replaceChildren()
})

describe('Sidebar navigation styles', () => {
  it('keeps the 44px nav-item minimum height inclusive of padding', () => {
    const navItemRule = stylesheet.match(/(?:^|\n)\.nav-item\s*\{([^}]*)\}/)?.[1]

    expect(navItemRule).toBeDefined()
    expect(navItemRule).toMatch(/\bbox-sizing\s*:\s*border-box\s*;/)
  })

  it('renders the navigation heading and collapse icon as designed controls', () => {
    mountStyles()
    const header = document.createElement('div')
    header.className = 'sidebar__header'
    const label = document.createElement('span')
    label.className = 'sidebar__header-label'
    const toggle = document.createElement('button')
    toggle.className = 'sidebar__collapse-toggle'
    const mobileToggle = document.createElement('button')
    mobileToggle.className = 'top-header__sidebar-toggle'
    header.append(label, toggle)
    document.body.append(header, mobileToggle)

    expect(getComputedStyle(header).display).toBe('flex')
    expect(getComputedStyle(label).textTransform).toBe('uppercase')
    expect(getComputedStyle(toggle).display).toBe('inline-flex')
    expect(getComputedStyle(toggle).width).toBe('40px')
    expect(getComputedStyle(toggle).height).toBe('40px')
    expect(getComputedStyle(toggle).borderStyle).toBe('solid')
    expect(getComputedStyle(mobileToggle).display).toBe('none')
  })

  it('keeps the collapsed sidebar as a stable accessible icon rail', () => {
    const sidebarRule = stylesheet.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1]

    expect(sidebarRule).toBeDefined()
    expect(sidebarRule).not.toMatch(/\btransition\s*:\s*width\b/)

    mountStyles()
    const app = document.createElement('div')
    app.className = 'app app--sidebar-collapsed'
    const sidebar = document.createElement('aside')
    sidebar.className = 'sidebar sidebar--collapsed'
    const nav = document.createElement('nav')
    nav.className = 'nav'
    const navItem = document.createElement('button')
    navItem.className = 'nav-item'
    const itemLabel = document.createElement('span')
    itemLabel.className = 'nav-item__label'
    navItem.append(itemLabel)
    const sectionLabel = document.createElement('div')
    sectionLabel.className = 'nav-label'
    nav.append(navItem, sectionLabel)
    sidebar.append(nav)
    app.append(sidebar)
    document.body.append(app)

    expect(getComputedStyle(app).getPropertyValue('--sidebar-w').trim()).toBe('72px')
    expect(getComputedStyle(sidebar).transitionProperty).not.toContain('width')
    expect(getComputedStyle(navItem).width).toBe('52px')
    expect(getComputedStyle(navItem).height).toBe('42px')
    expect(getComputedStyle(nav).alignItems).toBe('flex-start')
    expect(getComputedStyle(navItem).transitionProperty).not.toContain('all')
    expect(getComputedStyle(itemLabel).display).not.toBe('none')
    expect(getComputedStyle(itemLabel).position).toBe('absolute')
    expect(getComputedStyle(itemLabel).willChange).toBe('opacity, transform')
    expect(stylesheet).toMatch(/transition: opacity 0\.3s ease 0\.12s,\s*\r?\n\s*transform 0\.32s/)
    expect(stylesheet).toMatch(/transition: opacity 0\.28s ease,\s*\r?\n\s*transform 0\.3s ease,\s*\r?\n\s*visibility 0s linear 0\.28s/)
    expect(getComputedStyle(itemLabel).opacity).toBe('0')
    expect(getComputedStyle(itemLabel).visibility).toBe('hidden')
    expect(getComputedStyle(itemLabel).transform).toBe('translateX(-6px)')
    expect(getComputedStyle(sectionLabel).display).not.toBe('none')
    expect(getComputedStyle(sectionLabel).visibility).toBe('hidden')
    expect(getComputedStyle(sectionLabel).whiteSpace).toBe('nowrap')
    expect(getComputedStyle(nav).paddingTop).toBe('16px')
    expect(getComputedStyle(nav).overflowX).toBe('hidden')
  })
})
