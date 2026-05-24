import liff from '@line/liff';

const LIFF_ID        = import.meta.env.VITE_LIFF_ID as string | undefined;
const LIFF_ENABLED   = Boolean(LIFF_ID && LIFF_ID !== 'your-liff-id-here');
const LINE_USER_KEY  = 'tannote_line_user_id';
const SIGNED_OUT_KEY = 'tannote_signed_out';

let initPromise: Promise<void> | null = null;

/** Initialize LIFF once. Skips auto-login if user explicitly signed out. */
export function initLiff(): Promise<void> {
  if (!LIFF_ENABLED) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = liff
    .init({ liffId: LIFF_ID! })
    .then(async () => {
      // User explicitly signed out — don't auto-login even if LIFF token is still valid
      if (localStorage.getItem(SIGNED_OUT_KEY) === 'true') return;

      if (!liff.isLoggedIn()) {
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

/** Override the stored LINE user ID. */
export function setLineUserId(id: string): void {
  const trimmed = id.trim();
  if (trimmed) localStorage.setItem(LINE_USER_KEY, trimmed);
  else localStorage.removeItem(LINE_USER_KEY);
}

/**
 * Sign out of LIFF: clears userId + sets signed-out flag so initLiff
 * won't auto-login on next page load even if LIFF token is still active.
 * Does NOT call liff.logout() inside LINE client — that would close the webview.
 */
export function logoutLiff(): void {
  localStorage.removeItem(LINE_USER_KEY);
  localStorage.setItem(SIGNED_OUT_KEY, 'true');
  if (!LIFF_ENABLED) return;
  try {
    // Only call liff.logout() in external browser (not inside LINE app)
    if (!liff.isInClient() && liff.isLoggedIn()) liff.logout();
  } catch { /* ignore */ }
}

/**
 * Explicitly log in with LINE (called from the login page).
 * Clears the signed-out flag, fetches profile, saves userId.
 * If LIFF session is still active, no redirect needed — just re-fetches profile.
 */
export async function loginWithLiff(): Promise<void> {
  localStorage.removeItem(SIGNED_OUT_KEY);
  if (!LIFF_ENABLED) return;
  try {
    if (!liff.isLoggedIn()) {
      liff.login(); // redirects — page will reload after auth
      return;
    }
    const profile = await liff.getProfile();
    if (profile.userId) localStorage.setItem(LINE_USER_KEY, profile.userId);
  } catch {
    try { liff.login(); } catch { /* ignore */ }
  }
}

export { LIFF_ENABLED };
