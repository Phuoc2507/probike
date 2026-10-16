// Hook React: mở không gian làm việc của đội (realtime) hoặc chế độ cá nhân (localStorage) khi teamId = null.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { SeedDefaults } from './doc';
import { PERSONAL_KEY, clearPersonalWorkspace, localStore, supabaseStore } from './persistence';
import { WorkspaceSession, type SessionState } from './session';
import { SupabaseTransport } from './transport';

export interface UseTeamWorkspaceOptions {
  /** giá trị khởi tạo khi workspace còn trống (thiết kế mẫu, code mẫu...) — phải giống nhau giữa các máy */
  seed?: SeedDefaults;
}

export interface TeamWorkspace extends SessionState {
  session: WorkspaceSession;
  kind: WorkspaceSession['kind'];
  /** Thử tải lại bản lưu ngay (khi loadError) */
  retryLoad: () => void;
  /** Chế độ cá nhân: xoá bài luyện tập lưu trên máy này và bắt đầu lại từ đầu */
  resetPersonal: () => void;
}

/** Khoá localStorage của chế độ cá nhân: tách theo tài khoản nếu đã đăng nhập. */
export function personalKey(userId: string | null) {
  return userId ? `${PERSONAL_KEY}:${userId}` : PERSONAL_KEY;
}

/** Tạo phiên theo teamId (dùng trực tiếp được ngoài React, ví dụ trong test tích hợp). */
export function createWorkspaceSession(teamId: string | null, user: { userId: string | null; name: string }, seed?: SeedDefaults) {
  if (!teamId) {
    return new WorkspaceSession({ kind: 'personal', transport: null, store: localStore(personalKey(user.userId)), user, seed });
  }
  return new WorkspaceSession({
    kind: 'team',
    transport: new SupabaseTransport(supabase, `team:${teamId}`),
    store: supabaseStore(teamId),
    user,
    seed,
  });
}

const noop = () => () => {};

/**
 * teamId = null → chế độ cá nhân (lưu localStorage, không mạng).
 * Trả null trong lúc chờ biết người dùng là ai.
 */
export function useTeamWorkspace(teamId: string | null, opts: UseTeamWorkspaceOptions = {}): TeamWorkspace | null {
  const auth = useAuth();
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [generation, setGeneration] = useState(0);
  const name = auth.profile?.fullName || auth.user?.email?.split('@')[0] || 'Khách';
  const userId = auth.user?.id ?? null;
  const key = teamId && userId ? `team:${teamId}` : 'personal';

  useEffect(() => {
    if (auth.loading) return;
    const s = createWorkspaceSession(key === 'personal' ? null : teamId, { userId, name }, opts.seed);
    setSession(s);
    void s.start();
    // Ẩn tab / đóng tab: lưu nốt (bỏ qua bầu chọn — có thể người lưu đã rời đi)
    const flush = () => {
      if (document.visibilityState === 'hidden') void s.saveNow(true);
    };
    const onHide = () => void s.saveNow(true);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      s.destroy();
    };
    // Chỉ tạo lại khi đổi đội / người dùng; name & seed đổi không cần kết nối lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId, auth.loading, generation]);

  const state = useSyncExternalStore(
    session ? (cb) => session.subscribe(cb) : noop,
    () => session?.state ?? null,
  );

  const retryLoad = useCallback(() => void session?.retryLoad(), [session]);
  const resetPersonal = useCallback(() => {
    if (!session || session.kind !== 'personal') return;
    session.discard();
    clearPersonalWorkspace(undefined, personalKey(userId));
    setGeneration((g) => g + 1);
  }, [session, userId]);

  if (!session || !state) return null;
  return { ...state, session, kind: session.kind, retryLoad, resetPersonal };
}
