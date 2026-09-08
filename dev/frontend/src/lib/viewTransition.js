/**
 * safeViewTransition — Utility hỗ trợ View Transitions API gốc của trình duyệt
 * Cho phép chuyển đổi màn hình/tab với GPU acceleration mà không làm đơ giao diện.
 * Tự động fallback chạy đồng bộ nếu trình duyệt chưa hỗ trợ hoặc người dùng bật giảm chuyển động (prefers-reduced-motion).
 */
export function safeViewTransition(updateCallback) {
  if (
    typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
    && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  ) {
    return document.startViewTransition(updateCallback);
  }
  updateCallback();
  return null;
}

