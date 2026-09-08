import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

function mountStyles(theme) {
  const style = document.createElement('style');
  style.dataset.testStyles = 'select';
  style.textContent = stylesheet;
  document.head.append(style);

  if (theme) document.documentElement.dataset.theme = theme;
}

afterEach(() => {
  document.head.querySelector('[data-test-styles="select"]')?.remove();
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

describe('Select styles', () => {
  it('defines a consistent option surface with a viewport-safe menu', () => {
    expect(stylesheet).toMatch(/\.ui-select\s*\{/);
    expect(stylesheet).toMatch(/\.ui-select__menu\s*\{[^}]*position:\s*fixed/s);
    expect(stylesheet).toMatch(/\.ui-select__option\.is-selected/);
    expect(stylesheet).toMatch(/max-height:\s*min\(/);
  });

  it('keeps focus, dark mode and reduced-motion styles explicit', () => {
    expect(stylesheet).toMatch(/\.ui-select__trigger:focus-visible/);
    expect(stylesheet).toMatch(/\[data-theme='dark'\] \.ui-select__trigger/);
    expect(stylesheet).toMatch(/prefers-reduced-motion:\s*reduce/);

    mountStyles('dark');
    const trigger = document.createElement('button');
    trigger.className = 'ui-select__trigger';
    document.body.append(trigger);

    expect(getComputedStyle(trigger).minHeight).toBe('40px');
    expect(getComputedStyle(trigger).color).not.toBe('');
  });
});
