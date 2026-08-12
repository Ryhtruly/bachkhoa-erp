const PALETTE = [
  'var(--orange-500)',
  'var(--blue-500)',
  'var(--green-500)',
  'var(--amber-500)',
  'var(--cyan-400)',
  'var(--orange-600)',
];

export function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColorFor(seed) {
  const str = String(seed || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
