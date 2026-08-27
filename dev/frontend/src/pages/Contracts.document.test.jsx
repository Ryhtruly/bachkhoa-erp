import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addToast, apiFetch, fetchProtectedDocumentBlob, requestDocxSaveHandle, writeBlobToFileHandle, contractSourceDocuments } = vi.hoisted(() => ({
  addToast: vi.fn(),
  apiFetch: vi.fn(),
  fetchProtectedDocumentBlob: vi.fn(),
  requestDocxSaveHandle: vi.fn(),
  writeBlobToFileHandle: vi.fn(),
  contractSourceDocuments: { value: [] },
}));

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }));
vi.mock('../lib/api', () => ({ apiFetch, getAccessToken: () => 'access-token' }));
vi.mock('../lib/fileSave', () => ({
  fetchProtectedDocumentBlob,
  requestDocxSaveHandle,
  writeBlobToFileHandle,
}));
vi.mock('../components/ui', () => ({
  DataTable: ({ columns, data }) => <div>{data.map((row) => <div key={row.id}>{columns.find((column) => column.key === 'file_link').render(row.file_link)}</div>)}</div>,
  FilterBar: () => null,
  StatusBadge: () => null,
}));
vi.mock('../features/contracts/ContractComposer', () => ({
  default: ({ open, onSubmit }) => open && (
    <button type="button" onClick={() => onSubmit({
      contract_id: '2004/BK-2026',
      customer_name: 'Lê Thị Kiểm Thử',
      contract_value: 18500000,
      contract_template_id: 'do-dac-v1',
      source_documents: contractSourceDocuments.value,
    })}>
      Lưu hợp đồng
    </button>
  ),
}));
vi.mock('../components/contracts/ContractDocumentViewer', () => ({
  default: ({ isOpen, documentUrl }) => isOpen ? <div data-testid="contract-document-viewer">{documentUrl}</div> : null,
}));

import Contracts from './Contracts';

// Ba lời gọi nạp dữ liệu lúc trang mở đều đi qua apiFetch. Mock chung một giá
// trị cho mọi URL sẽ nhét payload của "tạo tài liệu" vào chỗ config và danh sách
// hợp đồng — trang không render nổi. Định tuyến theo URL, giống backend thật.
const NAP_DU_LIEU = (url) => {
  const duongDan = String(url);
  if (duongDan === '/api/config') return { personnel: [], services: [] };
  if (duongDan === '/api/catalog/service-packages') return { data: [] };
  if (duongDan === '/api/contracts/next-code') return { contract_id: '2004/BK-2026' };
  if (duongDan.startsWith('/api/contracts/workspace-list')) {
    return {
      data: [{ id: '2004/BK-2026', file_link: '/api/contracts/2004/BK-2026/document', service_lines: [] }],
      pagination: { page: 1, total_pages: 0, total_contracts: 1, total_groups: 1 },
    };
  }
  return null; // không phải lời gọi nạp dữ liệu — để test tự quyết
};

const TAI_LIEU = { download_url: '/api/contracts/2004/BK-2026/document' };

describe('Contracts document actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractSourceDocuments.value = [];
    window.open = vi.fn();
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/contracts/templates') {
        return [{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }];
      }
      return NAP_DU_LIEU(url) ?? TAI_LIEU;
    });
    fetchProtectedDocumentBlob.mockResolvedValue(new Blob(['docx']));
    writeBlobToFileHandle.mockResolvedValue({ success: true, method: 'picker' });
    vi.stubGlobal('fetch', vi.fn((url) => {
      const normalized = String(url);
      if (normalized === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) });
      if (normalized === '/api/contracts/next-code') return Promise.resolve({ ok: true, json: async () => ({ contract_id: '2004/BK-2026' }) });
      if (normalized.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({
          data: [{ id: '2004/BK-2026', file_link: '/api/contracts/2004/BK-2026/document', service_lines: [] }],
          pagination: { page: 1, total_pages: 0, total_contracts: 1, total_groups: 1 },
        }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${normalized}`));
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('claims the save location before it creates and writes a contract DOCX', async () => {
    const order = [];
    requestDocxSaveHandle.mockImplementation(async () => {
      order.push('picker');
      return { handle: { id: 'save-handle' } };
    });
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/contracts/templates') {
        return [{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }];
      }
      const duLieuNap = NAP_DU_LIEU(url);
      if (duLieuNap) return duLieuNap;
      order.push('create');
      return TAI_LIEU;
    });
    fetchProtectedDocumentBlob.mockImplementation(async () => {
      order.push('fetch-docx');
      return new Blob(['docx']);
    });
    writeBlobToFileHandle.mockImplementation(async () => {
      order.push('write-docx');
      return { success: true, method: 'picker' };
    });

    render(<Contracts />);
    await screen.findByTitle('Soạn hợp đồng mới');
    fireEvent.click(screen.getByTitle('Soạn hợp đồng mới'));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu hợp đồng' }));

    await waitFor(() => expect(writeBlobToFileHandle).toHaveBeenCalledOnce());
    expect(order).toEqual(['picker', 'create', 'fetch-docx', 'write-docx']);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the in-app viewer instead of downloading the selected contract document', async () => {
    render(<Contracts />);
    const openDocument = await screen.findByRole('button', { name: 'Mở tài liệu hợp đồng' });
    fireEvent.click(openDocument);

    expect(screen.getByTestId('contract-document-viewer')).toHaveTextContent('/api/contracts/2004/BK-2026/document');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('uploads every non-empty source file and does not send empty files to the API', async () => {
    contractSourceDocuments.value = [
      new File(['so do'], 'so-do.pdf', { type: 'application/pdf' }),
      new File([], 'HopDong_006_BK-2026_Le_quang_Tri.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      new File(['cccd'], 'cccd.jpg', { type: 'image/jpeg' }),
    ];
    requestDocxSaveHandle.mockResolvedValue({ reason: 'SaveLocationUnsupported' });
    const sourceUploadBodies = [];
    apiFetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/contracts/templates') {
        return [{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }];
      }
      const duLieuNap = NAP_DU_LIEU(url);
      if (duLieuNap) return duLieuNap;
      if (String(url).includes('/source-documents')) {
        sourceUploadBodies.push(options.body.get('file'));
        return { status: 'success' };
      }
      return TAI_LIEU;
    });

    render(<Contracts />);
    const openButtons = await screen.findAllByTitle('Soạn hợp đồng mới');
    fireEvent.click(openButtons[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu hợp đồng' }));

    await waitFor(() => expect(sourceUploadBodies).toHaveLength(2));
    expect(sourceUploadBodies.map(file => file.name)).toEqual(['so-do.pdf', 'cccd.jpg']);
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('1 tệp'), 'error');
  });
});
