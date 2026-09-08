/**
 * Unsaved changes navigation guard.
 *
 * Provides a central registration for active view controllers that have unsaved changes.
 */

let activeGuard = null;

/**
 * Register an unsaved changes guard. Returns an unsubscribe function.
 * @param {{ hasChanges: () => boolean, promptConfirm: () => Promise<boolean> }} guard
 */
export function registerUnsavedChangesGuard(guard) {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

/**
 * Request permission before navigating away from active view.
 * @returns {Promise<boolean>} true if allowed to navigate.
 */
export async function requestNavigationPermission() {
  if (!activeGuard) return true;
  try {
    const hasPendingChanges = activeGuard.hasChanges
      ? activeGuard.hasChanges()
      : (activeGuard.coThayDoi ? activeGuard.coThayDoi() : false);
    if (!hasPendingChanges) return true;

    if (typeof activeGuard.promptConfirm === 'function') {
      return await activeGuard.promptConfirm();
    }
    if (typeof activeGuard.hoi === 'function') {
      return await activeGuard.hoi();
    }
    return true;
  } catch {
    return true;
  }
}

// Backward-compatibility aliases
export const giuKhiChuaLuu = registerUnsavedChangesGuard;
export const xinPhepRoiDi = requestNavigationPermission;
