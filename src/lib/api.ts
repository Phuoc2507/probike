// Lớp gọi backend dùng chung cho các trang. Session "Backend" hiện thực các hàm này;
// các session khác chỉ gọi theo chữ ký dưới đây.
//
// Cách gắn thành viên vào đội (đơn giản nhất, không cần mã mời):
//  - Trưởng nhóm khai báo email 4 thành viên khi đăng ký đội (bảng team_members, user_id = null).
//  - Thành viên chỉ cần tạo tài khoản / đăng nhập bằng magic link với ĐÚNG email đó ở /dang-nhap:
//    trigger tạo tài khoản tự gắn user_id; người đã có tài khoản thì getMyTeam() gọi RPC claim_membership().
import type { RunResult, Team, TeamMember, VehicleDesign, Stage, MapId } from '@/shared/types';
import { supabase } from './supabase';
import { fromByteaHex, toByteaHex } from './bytes';
import { friendlyError, normEmail, validateRegistration } from './format';

export interface RegisterTeamInput {
  teamName: string;
  school: string;
  leader: { fullName: string; email: string; phone: string; password: string };
  members: { fullName: string; email: string; phone: string; roleInTeam: string }[]; // không gồm trưởng nhóm, tối đa 4
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(e: { message?: string } | string | null | undefined): Result<T> => ({
  ok: false,
  error: friendlyError(typeof e === 'string' ? e : e?.message),
});

function siteUrl(path: string): string {
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
}

// ---------------------------------------------------------------- Ánh xạ hàng DB → kiểu dùng chung

interface TeamRow { id: string; name: string; school: string; leader_id: string | null; status: Team['status']; created_at: string }
interface MemberRow { id: string; team_id: string; user_id: string | null; full_name: string; email: string; phone: string; role_in_team: string }
interface ProgressRow { team_id: string; stage_reached: number; balance_best_s: number; best_score: number; updated_at: string }

export const mapTeam = (r: TeamRow): Team => ({
  id: r.id, name: r.name, school: r.school, leaderId: r.leader_id ?? '', status: r.status, createdAt: r.created_at,
});

/** TeamMember kèm id dòng (để BTC sửa/xoá). */
export interface TeamMemberRow extends TeamMember { id: string }

export const mapMember = (r: MemberRow): TeamMemberRow => ({
  id: r.id, teamId: r.team_id, userId: r.user_id, fullName: r.full_name, email: r.email, phone: r.phone, roleInTeam: r.role_in_team,
});

export interface TeamProgress { teamId: string; stageReached: Stage; balanceBestS: number; bestScore: number; updatedAt: string }

export const mapProgress = (r: ProgressRow): TeamProgress => ({
  teamId: r.team_id, stageReached: r.stage_reached as Stage, balanceBestS: Number(r.balance_best_s),
  bestScore: Number(r.best_score), updatedAt: r.updated_at,
});

/** PostgREST trả quan hệ 1-1 có thể là object hoặc mảng — chuẩn hoá về object|null. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

// ---------------------------------------------------------------- Hợp đồng gốc

export async function registerTeam(input: RegisterTeamInput): Promise<Result<{ teamId: string; needsEmailConfirm?: boolean }>> {
  const leaderEmail = normEmail(input.leader.email);
  const { data: s } = await supabase.auth.getSession();
  // Đã đăng nhập bằng đúng email trưởng nhóm → đăng ký qua RPC, không cần mật khẩu
  const viaRpc = Boolean(s.session?.user.email && normEmail(s.session.user.email) === leaderEmail);

  const invalid = validateRegistration(input, { requirePassword: !viaRpc });
  if (invalid) return fail(invalid);

  const members = input.members.map((m) => ({
    full_name: m.fullName.trim(), email: normEmail(m.email), phone: m.phone.trim(), role_in_team: m.roleInTeam.trim(),
  }));

  // Kiểm tra trước để báo lỗi rõ ràng (hàm chỉ trả đúng/sai, không lộ email nào đã dự thi)
  const check = await supabase.rpc('check_team_registration', {
    p_team_name: input.teamName, p_emails: [leaderEmail, ...members.map((m) => m.email)],
  });
  if (check.error) return fail(check.error);
  const c = check.data as { name_taken: boolean; any_email_taken: boolean };
  if (c.name_taken) return fail('Tên đội đã được dùng, hãy chọn tên khác');
  if (c.any_email_taken) return fail('Có email (trưởng nhóm hoặc thành viên) đã thuộc một đội khác');

  if (viaRpc) {
    const { data, error } = await supabase.rpc('register_team', {
      p_team_name: input.teamName, p_school: input.school, p_leader_name: input.leader.fullName,
      p_leader_phone: input.leader.phone, p_members: members,
    });
    if (error) return fail(error);
    return ok({ teamId: data as string });
  }

  // Tạo tài khoản trưởng nhóm. Đội nằm chờ trong metadata, DB chỉ tạo đội khi email trưởng nhóm đã xác nhận.
  const { data, error } = await supabase.auth.signUp({
    email: leaderEmail,
    password: input.leader.password,
    options: {
      emailRedirectTo: siteUrl('/dang-nhap'),
      data: {
        full_name: input.leader.fullName.trim(),
        phone: input.leader.phone.trim(),
        school: input.school.trim(),
        pending_team: { team_name: input.teamName.trim(), school: input.school.trim(), members },
      },
    },
  });
  if (error) return fail(error);
  // Supabase trả user "giả" (identities rỗng) khi email đã tồn tại và đang bật xác nhận email
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return fail('Email trưởng nhóm đã có tài khoản — hãy đăng nhập rồi đăng ký đội');
  }
  if (!data.session) return ok({ teamId: '', needsEmailConfirm: true });

  const team = await getMyTeam();
  if (team.ok && team.data) return ok({ teamId: team.data.team.id });
  return fail('Đã tạo tài khoản nhưng chưa tạo được đội — hãy đăng ký lại (tên đội có thể vừa bị dùng)');
}

const TEAM_COLS = 'id, name, school, leader_id, status, created_at';
const MEMBER_COLS = 'id, team_id, user_id, full_name, email, phone, role_in_team, created_at';

export async function getMyTeam(): Promise<Result<{ team: Team; members: TeamMember[] } | null>> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return ok(null);
  const claim = await supabase.rpc('claim_membership');
  if (claim.error) return fail(claim.error);
  const teamId = claim.data as string | null;
  if (!teamId) return ok(null);
  const [t, m] = await Promise.all([
    supabase.from('teams').select(TEAM_COLS).eq('id', teamId).single(),
    supabase.from('team_members').select(MEMBER_COLS).eq('team_id', teamId).order('created_at'),
  ]);
  if (t.error) return fail(t.error);
  if (m.error) return fail(m.error);
  return ok({ team: mapTeam(t.data as TeamRow), members: (m.data as MemberRow[]).map(mapMember) });
}

/**
 * Lưu lượt chạy và cập nhật tiến độ. Lưu ý: điểm do trình duyệt tự tính và gửi lên — BTC không nên coi đây là
 * kết quả chính thức (xem supabase/README.md).
 */
export async function saveRun(teamId: string, result: RunResult, design: VehicleDesign): Promise<Result<{ runId: string }>> {
  const { data, error } = await supabase
    .from('runs')
    .insert({
      team_id: teamId, map_id: result.mapId, result, design,
      score: result.score, time_s: result.timeS,
    })
    .select('id')
    .single();
  if (error) return fail(error);
  const runId = (data as { id: string }).id;
  // balance_flat chỉ tính thời gian giữ thăng bằng; điểm tốt nhất chỉ tính các map sa hình
  const p = await updateProgress(
    teamId,
    result.mapId === 'balance_flat' ? { balanceBestS: result.balancedS } : { bestScore: result.score },
  );
  if (!p.ok) return fail(`Đã lưu lượt chạy nhưng chưa cập nhật được tiến độ: ${p.error}`);
  return ok({ runId });
}

export async function updateProgress(teamId: string, patch: { stageReached?: Stage; balanceBestS?: number; bestScore?: number }): Promise<Result<null>> {
  const { error } = await supabase.rpc('update_progress', {
    p_team: teamId,
    p_stage: patch.stageReached ?? null,
    p_balance: patch.balanceBestS ?? null,
    p_score: patch.bestScore ?? null,
  });
  return error ? fail(error) : ok(null);
}

// ---------------------------------------------------------------- Đăng nhập / tài khoản

export interface Profile { id: string; fullName: string; school: string; phone: string; role: 'member' | 'admin' }

export async function signInWithPassword(email: string, password: string): Promise<Result<null>> {
  const { error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password });
  return error ? fail(error) : ok(null);
}

/** Gửi link đăng nhập qua email. Tạo tài khoản nếu chưa có (thành viên được trưởng nhóm khai báo dùng cách này). */
export async function signInWithMagicLink(email: string): Promise<Result<null>> {
  const { error } = await supabase.auth.signInWithOtp({
    email: normEmail(email),
    options: { emailRedirectTo: siteUrl('/dang-nhap'), shouldCreateUser: true },
  });
  return error ? fail(error) : ok(null);
}

/** Tạo tài khoản thành viên bằng mật khẩu (email phải là email trưởng nhóm đã khai báo để được gắn vào đội). */
export async function signUpMember(email: string, password: string, fullName: string): Promise<Result<{ needsEmailConfirm: boolean }>> {
  const { data, error } = await supabase.auth.signUp({
    email: normEmail(email), password,
    options: { emailRedirectTo: siteUrl('/dang-nhap'), data: { full_name: fullName.trim() } },
  });
  if (error) return fail(error);
  if (data.user?.identities?.length === 0) return fail('Email này đã có tài khoản — hãy đăng nhập');
  return ok({ needsEmailConfirm: !data.session });
}

/** Quên mật khẩu: gửi email chứa link về /dang-nhap?dat-lai=1 */
export async function sendPasswordReset(email: string): Promise<Result<null>> {
  const { error } = await supabase.auth.resetPasswordForEmail(normEmail(email), { redirectTo: siteUrl('/dang-nhap?dat-lai=1') });
  return error ? fail(error) : ok(null);
}

export async function updatePassword(password: string): Promise<Result<null>> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? fail(error) : ok(null);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getMyProfile(): Promise<Result<Profile | null>> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return ok(null);
  const { data, error } = await supabase.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
  if (error) return fail(error);
  if (!data) return ok(null);
  return ok({ id: data.id, fullName: data.full_name, school: data.school, phone: data.phone, role: data.role });
}

// ---------------------------------------------------------------- Workspace & lịch sử chạy

export interface WorkspaceSnapshot { snapshot: Uint8Array | null; design: VehicleDesign | null; updatedAt: string | null }

export async function loadWorkspace(teamId: string): Promise<Result<WorkspaceSnapshot>> {
  const { data, error } = await supabase.from('workspaces').select('*').eq('team_id', teamId).maybeSingle();
  if (error) return fail(error);
  return ok({
    snapshot: fromByteaHex(data?.ydoc_snapshot ?? null),
    design: (data?.design as VehicleDesign | null) ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function saveWorkspace(teamId: string, snapshot: Uint8Array, design: VehicleDesign | null): Promise<Result<null>> {
  const { error } = await supabase
    .from('workspaces')
    .upsert({ team_id: teamId, ydoc_snapshot: toByteaHex(snapshot), design });
  return error ? fail(error) : ok(null);
}

export interface RunRow { id: string; teamId: string; userId: string | null; mapId: MapId; result: RunResult; score: number; timeS: number; createdAt: string }

const mapRun = (r: { id: string; team_id: string; user_id: string | null; map_id: string; result: RunResult; score: number; time_s: number; created_at: string }): RunRow => ({
  id: r.id, teamId: r.team_id, userId: r.user_id, mapId: r.map_id as MapId, result: r.result,
  score: Number(r.score), timeS: Number(r.time_s), createdAt: r.created_at,
});

export async function listTeamRuns(teamId: string, limit = 50): Promise<Result<RunRow[]>> {
  const { data, error } = await supabase
    .from('runs').select('id, team_id, user_id, map_id, result, score, time_s, created_at')
    .eq('team_id', teamId).order('created_at', { ascending: false }).limit(limit);
  return error ? fail(error) : ok(data.map(mapRun));
}

// ---------------------------------------------------------------- BTC (RLS chỉ cho admin)

export interface AdminTeam {
  team: Team;
  adminNote: string;
  members: TeamMemberRow[];
  progress: TeamProgress | null;
}

const ADMIN_TEAM_SELECT = `${TEAM_COLS}, team_members(${MEMBER_COLS}), progress(*), team_admin_notes(note)`;

type AdminTeamRow = TeamRow & {
  team_members: MemberRow[];
  progress: ProgressRow | ProgressRow[] | null;
  team_admin_notes: { note: string } | { note: string }[] | null;
};

const mapAdminTeam = (r: AdminTeamRow): AdminTeam => {
  const p = one(r.progress);
  return {
    team: mapTeam(r),
    adminNote: one(r.team_admin_notes)?.note ?? '',
    members: [...(r.team_members ?? [])].map(mapMember),
    progress: p ? mapProgress(p) : null,
  };
};

/** RLS chặn thì PostgREST không báo lỗi mà chỉ đổi 0 dòng — kiểm tra số dòng trả về. */
const NO_ROWS = 'Không có quyền hoặc dữ liệu không còn tồn tại';

export async function adminListTeams(): Promise<Result<AdminTeam[]>> {
  const { data, error } = await supabase.from('teams').select(ADMIN_TEAM_SELECT).order('created_at', { ascending: false });
  return error ? fail(error) : ok((data as unknown as AdminTeamRow[]).map(mapAdminTeam));
}

export async function adminGetTeam(teamId: string): Promise<Result<AdminTeam & { design: VehicleDesign | null; workspaceUpdatedAt: string | null }>> {
  const [t, w] = await Promise.all([
    supabase.from('teams').select(ADMIN_TEAM_SELECT).eq('id', teamId).maybeSingle(),
    supabase.from('workspaces').select('design, updated_at').eq('team_id', teamId).maybeSingle(),
  ]);
  if (t.error) return fail(t.error);
  if (!t.data) return fail('Không tìm thấy đội');
  return ok({
    ...mapAdminTeam(t.data as unknown as AdminTeamRow),
    design: (w.data?.design as VehicleDesign | null) ?? null,
    workspaceUpdatedAt: w.data?.updated_at ?? null,
  });
}

export async function adminSetTeamStatus(teamId: string, status: Team['status'], note?: string): Promise<Result<null>> {
  const { data, error } = await supabase.from('teams').update({ status }).eq('id', teamId).select('id');
  if (error) return fail(error);
  if (!data?.length) return fail(NO_ROWS);
  if (note !== undefined) {
    const n = await supabase.from('team_admin_notes').upsert({ team_id: teamId, note }).select('team_id');
    if (n.error) return fail(n.error);
    if (!n.data?.length) return fail(NO_ROWS);
  }
  return ok(null);
}

export interface BudgetItem { id: string; category: string; name: string; qty: number; unitPrice: number; note: string; sort: number }

type BudgetRow = { id: string; category: string; name: string; qty: number; unit_price: number; note: string; sort: number };
const mapBudget = (r: BudgetRow): BudgetItem => ({
  id: r.id, category: r.category, name: r.name, qty: Number(r.qty), unitPrice: Number(r.unit_price), note: r.note, sort: r.sort,
});

export async function adminListBudget(): Promise<Result<BudgetItem[]>> {
  const { data, error } = await supabase.from('budget_items').select('*').order('sort').order('created_at');
  return error ? fail(error) : ok((data as BudgetRow[]).map(mapBudget));
}

export async function adminAddBudgetItem(item: Omit<BudgetItem, 'id'>): Promise<Result<BudgetItem>> {
  const { data, error } = await supabase
    .from('budget_items')
    .insert({ category: item.category, name: item.name, qty: item.qty, unit_price: item.unitPrice, note: item.note, sort: item.sort })
    .select('*').single();
  return error ? fail(error) : ok(mapBudget(data as BudgetRow));
}

export async function adminUpdateBudgetItem(id: string, patch: Partial<Omit<BudgetItem, 'id'>>): Promise<Result<null>> {
  const row: Record<string, unknown> = {};
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.qty !== undefined) row.qty = patch.qty;
  if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.sort !== undefined) row.sort = patch.sort;
  const { data, error } = await supabase.from('budget_items').update(row).eq('id', id).select('id');
  if (error) return fail(error);
  return data?.length ? ok(null) : fail(NO_ROWS);
}

export async function adminDeleteBudgetItem(id: string): Promise<Result<null>> {
  const { data, error } = await supabase.from('budget_items').delete().eq('id', id).select('id');
  if (error) return fail(error);
  return data?.length ? ok(null) : fail(NO_ROWS);
}

/** Số lượt chạy của mỗi đội (cho trang Tiến độ). */
export async function adminRunCounts(): Promise<Result<Record<string, { count: number; lastAt: string | null }>>> {
  const { data, error } = await supabase.from('runs').select('team_id, created_at').order('created_at', { ascending: false }).limit(5000);
  if (error) return fail(error);
  const out: Record<string, { count: number; lastAt: string | null }> = {};
  for (const r of data as { team_id: string; created_at: string }[]) {
    const o = (out[r.team_id] ??= { count: 0, lastAt: r.created_at });
    o.count++;
  }
  return ok(out);
}
