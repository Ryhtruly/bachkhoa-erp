import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addToast, apiFetch, fetchProtectedDocumentBlob, requestDocxSaveHandle, writeBlobToFileHandle } = vi.hoisted(() => ({
  addToast: vi.fn(),
  apiFetch: vi.fn(),
  fetchProtectedDocumentBlob: vi.fn(),
  requestDocxSaveHandle: vi.fn(),
  writeBlobToFileHandle: vi.fn(),
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
    })}>
      Lưu hợp đồng
    </button>
  ),
}));
vi.mock('../components/contracts/ContractDocumentViewer', () => ({
  default: ({ isOpen, documentUrl }) => isOpen ? <div data-testid="contract-document-viewer">{documentUrl}</div> : null,
}));

import Contracts from './Contracts';

describe('Contracts document actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
    requestDocxSaveHandle.mockResolvedValue({ handle: { id: 'save-handle' } });
    apiFetch.mockResolvedValue({ download_url: '/api/contracts/2004/BK-2026/document' });
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
    apiFetch.mockImplementation(async () => {
      order.push('create');
      return { download_url: '/api/contracts/2004/BK-2026/document' };
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
});
