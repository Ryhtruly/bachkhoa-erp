const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function printElement({ element, title, styles = '', onError }) {
  if (!element) {
    onError?.('Không tìm thấy nội dung cần in');
    return false;
  }

  const printableElement = element.cloneNode(true);
  const printedAt = printableElement.querySelector('[data-print-timestamp]');
  if (printedAt) {
    printedAt.textContent = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
  }

  const printFrame = document.createElement('iframe');
  printFrame.setAttribute('title', `Bản in ${title || 'chứng từ'}`);
  printFrame.setAttribute('aria-hidden', 'true');
  Object.assign(printFrame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });

  let cleanupTimer;
  const cleanup = () => {
    window.clearTimeout(cleanupTimer);
    printFrame.remove();
  };

  printFrame.onload = () => {
    const printWindow = printFrame.contentWindow;
    if (!printWindow) {
      cleanup();
      onError?.('Trình duyệt không thể mở bản in');
      return;
    }

    const startPrint = () => {
      printWindow.addEventListener('afterprint', cleanup, { once: true });
      cleanupTimer = window.setTimeout(cleanup, 120000);
      printWindow.focus();
      printWindow.print();
    };

    const fontsReady = printWindow.document.fonts?.ready;
    if (fontsReady) {
      fontsReady.then(startPrint).catch(startPrint);
    } else {
      startPrint();
    }
  };

  printFrame.srcdoc = `<!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title || 'Bản in')}</title>
        <style>${styles}</style>
      </head>
      <body>${printableElement.outerHTML}</body>
    </html>`;

  document.body.appendChild(printFrame);
  return true;
}
