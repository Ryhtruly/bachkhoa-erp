import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openProtectedDocument, saveFileWithUserLocation } from './fileSave';

describe('saveFileWithUserLocation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses window.showSaveFilePicker when available', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockHandle = {
      createWritable: vi.fn().mockResolvedValue({
        write: mockWrite,
        close: mockClose,
      }),
    };

    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

    const testBlob = new Blob(['test content'], { type: 'text/plain' });
    const result = await saveFileWithUserLocation(testBlob, 'TestHopDong.docx');

    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'TestHopDong.docx',
      })
    );
    expect(mockHandle.createWritable).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(testBlob);
    expect(mockClose).toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: 'picker' });
  });

  it('handles user cancellation (AbortError) gracefully without throwing', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError);

    const testBlob = new Blob(['test content'], { type: 'text/plain' });
    const result = await saveFileWithUserLocation(testBlob, 'TestHopDong.docx');

    expect(result).toEqual({ success: false, cancelled: true });
  });

  it('does not download automatically when the location picker is unavailable', async () => {
    delete window.showSaveFilePicker;
    const createElement = vi.spyOn(document, 'createElement');

    const testBlob = new Blob(['test content'], { type: 'text/plain' });
    const result = await saveFileWithUserLocation(testBlob, 'FallbackHopDong.docx');

    expect(result).toEqual({ success: false, reason: 'SaveLocationUnsupported' });
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('openProtectedDocument', () => {
  it('fetches the protected document with bearer auth and opens its blob', async () => {
    const preview = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(preview);
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:contract-document');
    vi.spyOn(window, 'setTimeout').mockImplementation(() => 1);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['docx']) });

    const result = await openProtectedDocument('/api/contracts/2004/BK-2026/document', 'access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/contracts/2004/BK-2026/document',
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(preview.opener).toBeNull();
    expect(preview.location.replace).toHaveBeenCalledWith('blob:contract-document');
    expect(result).toEqual({ success: true });
  });
});
