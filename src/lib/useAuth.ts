// Trạng thái đăng nhập dùng chung (không cần Provider — store cấp module + useSyncExternalStore).
import { useSyncExternalStore } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getMyProfile, signOut, type Profile } from './api';

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** true khi người dùng vừa bấm link "đặt lại mật khẩu" trong email */
  recovery: boolean;
}

let state: AuthState = { loading: true, session: null, user: null, profile: null, isAdmin: false, recovery: false };
const listeners = new Set<() => void>();
let started = false;
let profileFor: string | null = null;

function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  state.isAdmin = state.profile?.role === 'admin';
  listeners.forEach((l) => l());
}

async function loadProfile(userId: string | null) {
  profileFor = userId;
  if (!userId) {
    set({ profile: null, loading: false });
    return;
  }
  const r = await getMyProfile();
  if (profileFor !== userId) return; // đã đổi người dùng trong lúc chờ
  set({ profile: r.ok ? r.data : null, loading: false });
}

function start() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, user: data.session?.user ?? null });
    void loadProfile(data.session?.user.id ?? null);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user.id ?? null;
    const changedUser = userId !== (state.user?.id ?? null);
    set({ session, user: session?.user ?? null, recovery: event === 'PASSWORD_RECOVERY' ? true : state.recovery });
    // Không gọi supabase trực tiếp trong callback (tránh deadlock của auth-js) → setTimeout
    if (changedUser) {
      set({ loading: true });
      setTimeout(() => void loadProfile(userId), 0);
    }
  });
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getAuthState(): AuthState {
  return state;
}

export function clearRecovery() {
  set({ recovery: false });
}

export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const s = useSyncExternalStore(subscribe, getAuthState, getAuthState);
  return { ...s, signOut };
}
