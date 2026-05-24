import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { setLineUserId, getLiffUserId } from './liff';

export type { Session };

export const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

/** Send magic link to email — returns error string or null */
export async function sendMagicLink(email: string): Promise<string | null> {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabaseClient.auth.signOut();
  const uid = getLiffUserId();
  if (uid.startsWith('sa_')) setLineUserId('');
}

/** Stable userId for Supabase-Auth email users */
export function authUserId(supabaseUid: string): string {
  return `sa_${supabaseUid}`;
}

/** Check if email matches VITE_ADMIN_EMAILS (comma-separated) */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** True when the current LIFF userId looks like a real LINE ID (Uxxxxxxxxxx, 33 chars)
 *  and the user hasn't explicitly signed out. */
export function isLiffAuthed(): boolean {
  if (localStorage.getItem('tannote_signed_out') === 'true') return false;
  const id = getLiffUserId();
  return /^U[a-zA-Z0-9]{32}$/.test(id);
}
