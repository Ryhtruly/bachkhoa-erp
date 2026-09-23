import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchProtectedDocumentBlob,
  fetchProtectedDocumentFile,
  downloadBlob,
  resolveDocumentFileName,
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

describe('fetchProtectedDocumentFile and fetchProtectedDocumentBlob', () => {
  it('fetches the protected document with bearer auth and extracts header filename', async () => {
    const documentBlob = new Blob(['docx content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-disposition': 'inline; filename="TaiLieuMau.docx"',
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      blob: async () => documentBlob,
    });
    const open = vi.spyOn(window, 'open');

    const result = await fetchProtectedDocumentFile('/api/wiki/download/BK-HS001', 'access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/wiki/download/BK-HS001',
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(result.blob).toBe(documentBlob);
    expect(result.fileName).toBe('TaiLieuMau.docx');
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(open).not.toHaveBeenCalled();
  });

  it('parses UTF-8 encoded filename from content-disposition', async () => {
    const documentBlob = new Blob(['pdf']);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-disposition': "attachment; filename*=UTF-8''%51uy%20%74r%C3%ACnh.pdf",
      }),
      blob: async () => documentBlob,
    });

    const result = await fetchProtectedDocumentFile('/api/wiki/download/ISO-01', 'token');
    expect(result.fileName).toBe('Quy trình.pdf');
  });

  it('fetchProtectedDocumentBlob delegates cleanly to fetchProtectedDocumentFile', async () => {
    const documentBlob = new Blob(['docx']);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: async () => documentBlob,
    });

    const result = await fetchProtectedDocumentBlob('/api/contracts/doc', 'token');
    expect(result).toBe(documentBlob);
  });
});

describe('resolveDocumentFileName', () => {
  it('preserves title and appends missing extension based on link', () => {
    const doc = {
      id: 'ISO-001',
      title: 'Quy trình kiểm tra chất lượng',
      link: 'wiki/ISO-001/qc_guide.docx',
    };
    const resolved = resolveDocumentFileName(doc);
    expect(resolved).toBe('Quy trình kiểm tra chất lượng.docx');
  });

  it('does not double append extension if title already has it', () => {
    const doc = {
      id: 'ISO-002',
      title: 'SoTayVanHoa.pdf',
      link: 'wiki/ISO-002/so_tay.pdf',
    };
    const resolved = resolveDocumentFileName(doc);
    expect(resolved).toBe('SoTayVanHoa.pdf');
  });

  it('uses MIME type when link does not have extension', () => {
    const doc = {
      id: 'ISO-003',
      title: 'Tài liệu hướng dẫn',
    };
    const resolved = resolveDocumentFileName(doc, null, 'application/pdf');
    expect(resolved).toBe('Tài liệu hướng dẫn.pdf');
  });

  it('uses header filename if title is missing', () => {
    const doc = { id: 'ISO-004' };
    const resolved = resolveDocumentFileName(doc, 'BieuMauISO.docx');
    expect(resolved).toBe('BieuMauISO.docx');
  });
});

describe('downloadBlob', () => {
  it('creates an invisible anchor with download attribute and triggers click', () => {
    const blob = new Blob(['test']);
    const mockClick = vi.fn();
    const mockAnchor = {
      href: '',
      download: '',
      style: {},
      click: mockClick,
      parentNode: { removeChild: vi.fn() },
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test-download'),
      revokeObjectURL: vi.fn(),
    });

    downloadBlob(blob, 'QuyTrinh.docx');

    expect(mockAnchor.download).toBe('QuyTrinh.docx');
    expect(mockAnchor.href).toBe('blob:test-download');
    expect(mockClick).toHaveBeenCalled();
  });
});
