import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchProtectedDocumentBlob,
  requestDocxSaveHandle,
  writeBlobToFileHandle,
} from './fileSave';

describe('DOCX file save helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete window.showSaveFilePicker;
  });

  it('claims a Save As handle before a DOCX blob exists', async () => {
    const mockHandle = { createWritable: vi.fn() };
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

    const result = await requestDocxSaveHandle('TestHopDong.docx');

    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'TestHopDong.docx' })
    );
    expect(result).toEqual({ handle: mockHandle });
  });

  it('writes a fetched DOCX blob to a previously selected handle', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockHandle = {
      createWritable: vi.fn().mockResolvedValue({
        write: mockWrite,
        close: mockClose,
      }),
    };

    const testBlob = new Blob(['test content'], { type: 'text/plain' });
    const result = await writeBlobToFileHandle(mockHandle, testBlob);

    expect(mockHandle.createWritable).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(testBlob);
    expect(mockClose).toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: 'picker' });
  });

  it('returns cancellation without creating a contract-side download fallback', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError);

    const result = await requestDocxSaveHandle('TestHopDong.docx');

    expect(result).toEqual({ cancelled: true });
  });

  it('does not download automatically when the location picker is unavailable', async () => {
    const createElement = vi.spyOn(document, 'createElement');

    const result = await requestDocxSaveHandle('FallbackHopDong.docx');

    expect(result).toEqual({ reason: 'SaveLocationUnsupported' });
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('fetchProtectedDocumentBlob', () => {
  it('fetches the protected document with bearer auth without opening a browser tab', async () => {
    const documentBlob = new Blob(['docx']);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => documentBlob });
    const open = vi.spyOn(window, 'open');

    const result = await fetchProtectedDocumentBlob('/api/contracts/2004/BK-2026/document', 'access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/contracts/2004/BK-2026/document',
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(result).toBe(documentBlob);
    expect(open).not.toHaveBeenCalled();
  });
});
