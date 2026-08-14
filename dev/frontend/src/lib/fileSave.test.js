import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveFileWithUserLocation } from './fileSave';

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

  it('falls back to <a> download when showSaveFilePicker is not available', async () => {
    delete window.showSaveFilePicker;

    const mockLink = {
      href: '',
      download: '',
      style: {},
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    const testBlob = new Blob(['test content'], { type: 'text/plain' });
    const result = await saveFileWithUserLocation(testBlob, 'FallbackHopDong.docx');

    expect(mockLink.download).toBe('FallbackHopDong.docx');
    expect(mockLink.click).toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: 'download' });
  });
});
