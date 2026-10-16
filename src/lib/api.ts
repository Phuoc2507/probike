// Lớp gọi backend dùng chung cho các trang. Session "Backend" hiện thực các hàm này;
// các session khác chỉ gọi theo chữ ký dưới đây.
import type { RunResult, Team, TeamMember, VehicleDesign, Stage } from '@/shared/types';

export interface RegisterTeamInput {
  teamName: string;
  school: string;
  leader: { fullName: string; email: string; phone: string; password: string };
  members: { fullName: string; email: string; phone: string; roleInTeam: string }[]; // không gồm trưởng nhóm, tối đa 4
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const notImplemented = <T,>(): Result<T> => ({ ok: false, error: 'Chưa hiện thực' });

export async function registerTeam(_input: RegisterTeamInput): Promise<Result<{ teamId: string }>> {
  return notImplemented();
}

export async function getMyTeam(): Promise<Result<{ team: Team; members: TeamMember[] } | null>> {
  return notImplemented();
}

export async function saveRun(_teamId: string, _result: RunResult, _design: VehicleDesign): Promise<Result<{ runId: string }>> {
  return notImplemented();
}

export async function updateProgress(_teamId: string, _patch: { stageReached?: Stage; balanceBestS?: number; bestScore?: number }): Promise<Result<null>> {
  return notImplemented();
}
