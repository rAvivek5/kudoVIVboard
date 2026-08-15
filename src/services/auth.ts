import type { Session, User } from '@supabase/supabase-js';
import { supabase, TABLES, readableError } from '@/lib/supabase';
import { env } from '@/lib/env';
import { toAdmin } from './mappers';
import type { AdminUser } from '@/types';

/* ----------------------------- admin sign-in ------------------------------ */

/** Admins sign in with a password. Guests never do. */
export async function adminSignIn(email: string, password: string): Promise<AdminUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error('That email and password did not match.');

  const profile = data.user ? await getAdminProfile(data.user.id) : null;
  if (!profile) {
    // Signed in, but not an admin. Do not leave a half-privileged session open.
    await supabase.auth.signOut();
    throw new Error('That account does not have admin access.');
  }
  return profile;
}

export async function getAdminProfile(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from(TABLES.admins)
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return toAdmin(data);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(readableError(error, 'Could not sign out.'));
}

export async function resetPassword(email: string): Promise<void> {
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${env.appUrl}/admin/login`,
  });
}

export function watchAuth(cb: (user: User | null, session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null, session);
  });
  return () => data.subscription.unsubscribe();
}

export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/* --------------------------- contributors --------------------------------- */

/**
 * There is nothing here on purpose.
 *
 * Contributors do not sign in. They give a name and an email in the composer,
 * both stored on the entry, and neither creates a Supabase Auth user or a
 * session. Editing their own post is authorised by supplying the same address
 * (see guest_update_entry in supabase/migrations). Admin password sign-in above
 * is the only authenticated path in the app.
 */
