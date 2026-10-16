// Đội của người đang đăng nhập (null nếu chưa đăng nhập hoặc chưa thuộc đội nào).
import { useCallback, useEffect, useState } from 'react';
import type { Team, TeamMember } from '@/shared/types';
import { getMyTeam } from './api';
import { useAuth } from './useAuth';

export interface MyTeamState {
  loading: boolean;
  team: Team | null;
  members: TeamMember[];
  error: string | null;
  refresh: () => void;
}

export function useMyTeam(): MyTeamState {
  const { user, loading: authLoading } = useAuth();
  const [tick, setTick] = useState(0);
  const [s, setS] = useState<Omit<MyTeamState, 'refresh'>>({ loading: true, team: null, members: [], error: null });
  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setS({ loading: false, team: null, members: [], error: null });
      return;
    }
    let alive = true;
    setS((p) => ({ ...p, loading: true }));
    getMyTeam().then((r) => {
      if (!alive) return;
      if (r.ok) setS({ loading: false, team: r.data?.team ?? null, members: r.data?.members ?? [], error: null });
      else setS({ loading: false, team: null, members: [], error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [userId, authLoading, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...s, refresh };
}
