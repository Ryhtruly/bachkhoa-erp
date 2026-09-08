import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export const DEFAULT_DOCUMENT_SIGNERS = {
  director_name: 'Lê Văn Sáu',
  accountant_name: '',
  accountant_role: 'Kế toán trưởng',
  cashier_name: '',
  payroll_accountant_name: '',
  creator_name: '',
};

export function normalizeDocumentSigners(value = {}) {
  return {
    ...DEFAULT_DOCUMENT_SIGNERS,
    ...Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, typeof item === 'string' ? item.trim() : item])),
  };
}

function getSignerNameKey(role) {
  if (role === 'Giám đốc' || role.includes('Giám đốc')) return 'director_name';
  if (role === 'Kế toán trưởng' || role === 'Kế toán phụ trách') return 'accountant_name';
  if (role === 'Kế toán tiền lương') return 'payroll_accountant_name';
  if (role === 'Thủ quỹ') return 'cashier_name';
  if (role === 'Người lập biểu' || role === 'Người lập bảng') return 'creator_name';
  return null;
}

export function resolveSignerEntries(entries = [], configuredSigners = {}) {
  const signers = normalizeDocumentSigners(configuredSigners);

  return entries.map(entry => {
    const resolvedEntry = (
      (entry.role === 'Kế toán trưởng' || entry.role === 'Kế toán phụ trách') && signers.accountant_role
    )
      ? { ...entry, role: signers.accountant_role }
      : entry;
    if (entry.name) return resolvedEntry;
    const nameKey = getSignerNameKey(resolvedEntry.role || '');
    const name = nameKey ? signers[nameKey] : '';
    return name ? { ...resolvedEntry, name } : resolvedEntry;
  });
}

let cachedSigners = null;
let inFlightPromise = null;

export function invalidateDocumentSignersCache() {
  cachedSigners = null;
  inFlightPromise = null;
}

export function setCachedDocumentSigners(data) {
  cachedSigners = normalizeDocumentSigners(data);
}

export function getCachedDocumentSigners() {
  return cachedSigners;
}

export function useDocumentSigners() {
  const [signers, setSigners] = useState(() => cachedSigners || DEFAULT_DOCUMENT_SIGNERS);

  useEffect(() => {
    let active = true;
    if (cachedSigners) {
      setSigners(cachedSigners);
      return;
    }

    if (!inFlightPromise) {
      inFlightPromise = apiFetch('/api/finance/document-signers')
        .then(value => {
          cachedSigners = normalizeDocumentSigners(value);
          inFlightPromise = null;
          return cachedSigners;
        })
        .catch(() => {
          inFlightPromise = null;
          return DEFAULT_DOCUMENT_SIGNERS;
        });
    }

    inFlightPromise.then(result => {
      if (active) setSigners(result);
    });

    return () => { active = false; };
  }, []);

  return signers;
}
