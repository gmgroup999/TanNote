import liff from '@line/liff';

const LIFF_ID         = import.meta.env.VITE_LIFF_ID as string | undefined;
const LIFF_ENABLED    = Boolean(LIFF_ID && LIFF_ID !== 'your-liff-id-here');
const LINE_USER_KEY   = 'tannote_line_user_id';

let initPromise: Promise<void> | null = null;

/** Initialize LIFF once. Safe to call multiple times. No-op if LIFF_ID is unset. */
export function initLiff(): Promise<void> {
  if (!LIFF_ENABLED) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = liff
    .init({ liffId: LIFF_ID! })
    .then(async () => {
      if (!liff.isLoggedIn()) {
        // Only redirect inside LINE app; keep dev fallback in browser
        if (liff.isInClient()) liff.login();
        return;
      }
      const profile = await liff.getProfile();
      if (profile.userId) localStorage.setItem(LINE_USER_KEY, profile.userId);
    })
    .catch((err) => {
      console.warn('[LIFF] init failed, using dev fallback:', err);
    });

  return initPromise;
}

/** Sync read: returns LIFF userId when set, else generates a stable dev_xxx fallback. */
export function getLiffUserId(): string {
  let id = localStorage.getItem(LINE_USER_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(LINE_USER_KEY, id);
  }
  return id;
}

/** Override the stored LINE user ID (used in Settings for manual test override). */
export function setLineUserId(id: string): void {
  const trimmed = id.trim();
  if (trimmed) localStorage.setItem(LINE_USER_KEY, trimmed);
  else localStorage.removeItem(LINE_USER_KEY);
}

/** Log out of LIFF (clears LIFF token so initLiff won't auto-login on next load). */
export function logoutLiff(): void {
  localStorage.removeItem(LINE_USER_KEY);
  if (!LIFF_ENABLED) return;
  try {
    if (liff.isLoggedIn()) liff.logout();
  } catch { /* ignore if liff not ready */ }
}

export { LIFF_ENABLED };
