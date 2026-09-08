import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRINT_STYLES, printElement } from './printDocument';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const printVoucherSource = readFileSync(
  resolve(process.cwd(), 'src/components/finance/screens/PrintVoucherScreen.jsx'),
  'utf8'
);
const printVoucherStyles = readFileSync(
  resolve(process.cwd(), 'src/components/finance/screens/PrintVoucherScreen.print.css'),
  'utf8'
);
const financeReportStyles = readFileSync(
  resolve(process.cwd(), 'src/components/finance/print/financeReport.print.css'),
  'utf8'
);

describe('printElement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('reports an error without creating a print frame when the source is missing', () => {
    const onError = vi.fn();

    expect(printElement({ element: null, title: 'Sổ quỹ', onError })).toBe(false);
    expect(onError).toHaveBeenCalledWith('Không tìm thấy nội dung cần in');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('prints only the supplied element inside an isolated iframe', () => {
    const source = document.createElement('section');
    source.className = 'target-report';
    source.textContent = 'Nội dung sổ quỹ';

    const focus = vi.fn();
    const print = vi.fn();
    let afterPrint;
    let createdFrame;
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation(tagName => {
      const element = originalCreateElement(tagName);
      if (tagName === 'iframe') {
        createdFrame = element;
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          value: {
            document: {},
            addEventListener: vi.fn((eventName, callback) => {
              if (eventName === 'afterprint') afterPrint = callback;
            }),
            focus,
            print,
          },
        });
      }
      return element;
    });

    expect(printElement({
      element: source,
      title: 'Sổ quỹ <tháng 8>',
      styles: '.target-report { color: #000; }',
    })).toBe(true);

    expect(createdFrame.style.width).toBe('100vw');
    expect(createdFrame.style.height).toBe('100vh');
    expect(createdFrame.srcdoc).toContain('<section class="target-report">Nội dung sổ quỹ</section>');
    expect(createdFrame.srcdoc).toContain('Sổ quỹ &lt;tháng 8&gt;');

    createdFrame.onload();
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();

    afterPrint();
    expect(document.body.contains(createdFrame)).toBe(false);
  });

  it('keeps the voucher screen on the shared print pipeline', () => {
    expect(printVoucherSource).toContain("import { printElement } from '../print/printDocument';");
    expect(printVoucherSource).not.toContain('printWindow.print()');
    expect(printVoucherSource).toContain("styles: voucherPrintStyles");
  });

  it('defines stable A4 and A5 page rules for voucher output', () => {
    expect(printVoucherStyles).toContain('@page voucher-a4');
    expect(printVoucherStyles).toContain('@page voucher-a5');
    expect(printVoucherStyles).toContain('page: voucher-a4');
    expect(printVoucherStyles).toContain('[data-paper-size="a5"]');
    expect(printVoucherStyles).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
  });

  it('keeps grand total footer at the end instead of repeating it on every printed page', () => {
    expect(financeReportStyles).toMatch(/\.finance-print-table\s+tfoot\s*\{\s*display:\s*table-row-group;/);
    expect(DEFAULT_PRINT_STYLES).toMatch(/\.finance-print-table tfoot\s*\{\s*display:\s*table-row-group !important;/);
  });

  it('keeps report tables inside the printable width', () => {
    expect(financeReportStyles).toMatch(/\.finance-print-table\s*\{[^}]*table-layout:\s*fixed;/s);
    expect(DEFAULT_PRINT_STYLES).toMatch(/\.finance-print-table\s*\{[^}]*table-layout:\s*fixed !important;/s);
  });
});
