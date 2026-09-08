const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const DEFAULT_PRINT_STYLES = `
@page {
  size: A4 landscape;
  margin: 10mm 12mm;
}
:root {
  color-scheme: light !important;
}
*, *::before, *::after {
  box-sizing: border-box;
  box-shadow: none !important;
  text-shadow: none !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
html, body {
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  background: #ffffff !important;
  color: #000000 !important;
  font-family: "Times New Roman", Times, serif, system-ui, sans-serif !important;
  font-size: 9.5pt !important;
  line-height: 1.4 !important;
}
.finance-print-document {
  width: 100% !important;
  background: #ffffff !important;
  color: #000000 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}
.finance-print-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: flex-start !important;
  gap: 12mm !important;
  padding-bottom: 3mm !important;
  border-bottom: 1.5px solid #000000 !important;
  line-height: 1.45 !important;
  font-size: 9.5pt !important;
}
.finance-print-header strong {
  font-size: 10pt !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  color: #000000 !important;
}
.finance-print-header__right {
  text-align: right !important;
  white-space: nowrap !important;
}
.finance-print-title {
  margin: 5mm 0 4mm !important;
  text-align: center !important;
}
.finance-print-title h1 {
  margin: 0 0 1.5mm !important;
  font-family: "Times New Roman", Times, serif !important;
  font-size: 16pt !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  color: #000000 !important;
}
.payroll-print-title, .payroll-print-title__main, .payroll-print-title__secondary {
  display: block !important;
}
.payroll-print-title__main {
  font-size: 17pt !important;
  line-height: 1.1 !important;
  letter-spacing: 0.8px !important;
}
.payroll-print-title__secondary {
  margin-top: 1.2mm !important;
  font-size: 11pt !important;
  line-height: 1.15 !important;
  letter-spacing: 1.6px !important;
}
.finance-print-subtitle {
  font-style: italic !important;
  font-size: 9pt !important;
  color: #333333 !important;
}
.finance-print-summary {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 3mm 8mm !important;
  margin-bottom: 4mm !important;
  padding: 2.5mm 4mm !important;
  background: #f8fafc !important;
  border: 1px solid #334155 !important;
  border-radius: 1.5mm !important;
  font-size: 9.5pt !important;
  color: #000000 !important;
}
.finance-print-summary > div {
  display: flex !important;
  align-items: center !important;
  gap: 2mm !important;
}
.finance-print-summary strong {
  font-weight: 700 !important;
  color: #000000 !important;
}
.finance-print-table {
  width: 100% !important;
  max-width: 100% !important;
  border-collapse: collapse !important;
  table-layout: fixed !important;
  font-size: 9pt !important;
  margin-bottom: 12px !important;
}
.finance-print-table thead {
  display: table-header-group !important;
}
.finance-print-table tr {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
.finance-print-table th {
  background: #f1f5f9 !important;
  color: #000000 !important;
  font-weight: 800 !important;
  font-size: 8.5pt !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
  white-space: nowrap !important;
  text-align: center !important;
  padding: 2.5mm 3mm !important;
  border: 1px solid #334155 !important;
  vertical-align: middle !important;
}
.finance-print-table td {
  padding: 2.5mm 3mm !important;
  border: 1px solid #334155 !important;
  vertical-align: middle !important;
  color: #000000 !important;
  background: transparent !important;
  font-size: 9pt !important;
  overflow-wrap: anywhere !important;
}
.finance-print-table tbody tr:nth-child(even) td {
  background: #f8fafc !important;
}
.finance-print-table .is-right {
  text-align: right !important;
  white-space: nowrap !important;
}
.finance-print-table .is-center {
  text-align: center !important;
  white-space: nowrap !important;
}
/* Grand total belongs to the end of the report, not to every printed page. */
.finance-print-table tfoot {
  display: table-row-group !important;
}
.finance-print-table .finance-print-footer-row td,
.finance-print-table tfoot td {
  background: #f8fafc !important;
  color: #000000 !important;
  font-weight: 800 !important;
  border-top: 2.5px double #000000 !important;
  border-bottom: 1px solid #334155 !important;
  font-size: 9.5pt !important;
}
.finance-print-empty {
  padding: 10mm !important;
  text-align: center !important;
  color: #64748b !important;
}
.finance-print-signatures {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 12mm !important;
  margin-top: 8mm !important;
  text-align: center !important;
  break-inside: avoid !important;
}
.finance-print-signatures div {
  display: flex !important;
  min-height: 24mm !important;
  flex-direction: column !important;
  gap: 1mm !important;
}
.finance-print-signatures strong {
  font-size: 9.5pt !important;
  text-transform: uppercase !important;
  color: #000000 !important;
}
.finance-print-signatures span {
  font-size: 8pt !important;
  font-style: italic !important;
  color: #475569 !important;
}
.finance-print-signature-name {
  margin-top: auto !important;
  font-size: 9pt !important;
  font-style: normal !important;
  font-weight: 700 !important;
  color: #000000 !important;
}
`;

export function formatPrintTimestamp(date = new Date()) {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes}:${seconds}, ngày ${day}/${month}/${year}`;
}

export function printElement({ element, title, styles = '', onError }) {
  if (!element) {
    onError?.('Không tìm thấy nội dung cần in');
    return false;
  }

  const printableElement = element.cloneNode(true);
  const printedAt = printableElement.querySelector('[data-print-timestamp]');
  if (printedAt) {
    printedAt.textContent = formatPrintTimestamp();
  }

  const printFrame = document.createElement('iframe');
  printFrame.setAttribute('title', `Bản in ${title || 'chứng từ'}`);
  printFrame.setAttribute('aria-hidden', 'true');
  Object.assign(printFrame.style, {
    position: 'fixed',
    left: '-100vw',
    top: '0',
    // Không dùng viewport 1px: bảng nhiều cột sẽ bị layout tràn ngang
    // trước khi trình duyệt chuyển document sang khổ giấy in.
    width: '100vw',
    height: '100vh',
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

  const combinedStyles = styles ? `${DEFAULT_PRINT_STYLES}\n${styles}` : DEFAULT_PRINT_STYLES;

  printFrame.srcdoc = `<!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title || 'Bản in')}</title>
        <style>${combinedStyles}</style>
      </head>
      <body>${printableElement.outerHTML}</body>
    </html>`;

  document.body.appendChild(printFrame);
  return true;
}
