import { afterEach, describe, expect, it, vi } from 'vitest';
import { printElement } from './printDocument';

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

    expect(createdFrame.srcdoc).toContain('<section class="target-report">Nội dung sổ quỹ</section>');
    expect(createdFrame.srcdoc).toContain('Sổ quỹ &lt;tháng 8&gt;');

    createdFrame.onload();
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();

    afterPrint();
    expect(document.body.contains(createdFrame)).toBe(false);
  });
});
