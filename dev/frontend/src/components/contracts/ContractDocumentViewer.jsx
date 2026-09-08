import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Modal } from '../ui';
import { fetchProtectedDocumentBlob } from '../../lib/fileSave';

export default function ContractDocumentViewer({ isOpen, documentUrl, accessToken, onClose }) {
  const surfaceRef = useRef(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !documentUrl || !surfaceRef.current) return undefined;

    let active = true;
    const surface = surfaceRef.current;
    surface.innerHTML = '';
    setState('loading');
    setError('');

    fetchProtectedDocumentBlob(documentUrl, accessToken)
      .then((blob) => {
        if (!active) return undefined;
        return renderAsync(blob, surface, null, { inWrapper: true });
      })
      .then(() => {
        if (active) setState('ready');
      })
      .catch((fetchError) => {
        if (!active) return;
        setState('error');
        setError(fetchError.message || 'Không thể xem tài liệu hợp đồng.');
      });

    return () => {
      active = false;
      surface.innerHTML = '';
    };
  }, [accessToken, documentUrl, isOpen]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Tài liệu hợp đồng"
      size="full"
      id="contract-document-viewer"
      overlayClassName="contract-document-viewer"
    >
      <div className="contract-document-viewer__content">
        {state === 'loading' && <p className="contract-document-viewer__status">Đang tải tài liệu Word...</p>}
        {state === 'error' && <p className="contract-document-viewer__status contract-document-viewer__status--error">{error}</p>}
        <div
          ref={surfaceRef}
          className="contract-document-viewer__surface"
          aria-busy={state === 'loading'}
          aria-label="Nội dung tài liệu hợp đồng"
        />
      </div>
    </Modal>
  );
}
