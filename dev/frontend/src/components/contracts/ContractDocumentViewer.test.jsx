import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAsync } from 'docx-preview';
import { fetchProtectedDocumentBlob } from '../../lib/fileSave';
import ContractDocumentViewer from './ContractDocumentViewer';

vi.mock('docx-preview', () => ({ renderAsync: vi.fn() }));
vi.mock('../../lib/fileSave', () => ({ fetchProtectedDocumentBlob: vi.fn() }));

describe('ContractDocumentViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
    fetchProtectedDocumentBlob.mockResolvedValue(new Blob(['docx']));
    renderAsync.mockImplementation(async (_blob, element) => {
      element.innerHTML = '<article>Hợp đồng hiện tại</article>';
    });
  });

  it('renders the authenticated DOCX inside its modal without opening a browser tab', async () => {
    render(
      <ContractDocumentViewer
        isOpen
        documentUrl="/api/contracts/2004/BK-2026/document"
        accessToken="access-token"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());

    expect(fetchProtectedDocumentBlob).toHaveBeenCalledWith(
      '/api/contracts/2004/BK-2026/document',
      'access-token',
    );
    expect(screen.getByText('Hợp đồng hiện tại')).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });
});
