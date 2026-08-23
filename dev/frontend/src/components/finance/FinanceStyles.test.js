import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

describe('Finance CSS contracts', () => {
  it('keeps the monthly dashboard split selector aligned with its responsive rules', () => {
    expect(stylesheet).toMatch(
      /\.finance-monthly-dashboard__split,\s*\.finance-monthly-dashboard__split-grid\s*\{/,
    );
    expect(stylesheet).toMatch(
      /\.finance-monthly-dashboard__split\s*,\s*\.finance-monthly-dashboard__split-grid\s*\{[^}]*grid-template-columns:[^}]*!important/s,
    );
  });

  it('keeps finance loading, help and payroll accent styles defined', () => {
    expect(stylesheet).toMatch(/\.animate-spin\s*\{/);
    expect(stylesheet).toMatch(/\.form-help--warning\s*\{/);
    expect(stylesheet).toMatch(/\.filter-bar-modern__control-input\s*\{/);
    expect(stylesheet).toMatch(/\.payroll-summary-card--neutral::before\s*\{/);
    expect(stylesheet).toMatch(/\.payroll-money--accent\s*\{/);
    expect(stylesheet).toMatch(/\[data-theme='dark'\] \.form-help--warning/);
    expect(stylesheet).toMatch(/\[data-theme='dark'\] \.payroll-money--accent/);
  });
});
