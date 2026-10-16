// Kiểm tra hợp lệ form đăng ký đội (thuần, không phụ thuộc React để test được).
import type { RegisterTeamInput } from '@/lib/api';

export const MAX_EXTRA_MEMBERS = 4;
export const ROLES_IN_TEAM = ['Cơ khí', 'Điện tử', 'Lập trình', 'Thiết kế', 'Khác'] as const;

export interface MemberForm {
  fullName: string;
  email: string;
  phone: string;
  roleInTeam: string;
}

export interface RegisterForm {
  teamName: string;
  school: string;
  leader: { fullName: string; email: string; phone: string; password: string; confirmPassword: string };
  members: MemberForm[];
  agree: boolean;
}

// Khoá lỗi dạng đường dẫn: 'teamName', 'leader.email', 'members.2.phone'...
export type FormErrors = Record<string, string>;

export const emptyMember = (): MemberForm => ({ fullName: '', email: '', phone: '', roleInTeam: ROLES_IN_TEAM[0] });

export const emptyForm = (): RegisterForm => ({
  teamName: '',
  school: '',
  leader: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  members: [emptyMember()],
  agree: false,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// SĐT Việt Nam: 0xxxxxxxxx (10 số) hoặc +84xxxxxxxxx; cho phép dấu cách, chấm, gạch
const PHONE_RE = /^(0|\+84)[1-9]\d{8}$/;

export const normalizePhone = (s: string) => s.replace(/[\s.-]/g, '');
const isBlankMember = (m: MemberForm) => !m.fullName.trim() && !m.email.trim() && !m.phone.trim();

function checkName(v: string, label: string): string | null {
  const t = v.trim();
  if (!t) return `Vui lòng nhập ${label}.`;
  if (t.length < 2) return `${label[0].toUpperCase() + label.slice(1)} quá ngắn.`;
  if (t.length > 80) return `${label[0].toUpperCase() + label.slice(1)} tối đa 80 ký tự.`;
  return null;
}

export function validateRegister(f: RegisterForm): FormErrors {
  const e: FormErrors = {};
  const set = (k: string, msg: string | null) => {
    if (msg) e[k] = msg;
  };

  set('teamName', checkName(f.teamName, 'tên đội'));
  set('school', checkName(f.school, 'tên trường'));

  set('leader.fullName', checkName(f.leader.fullName, 'họ tên trưởng nhóm'));
  if (!f.leader.email.trim()) e['leader.email'] = 'Vui lòng nhập email.';
  else if (!EMAIL_RE.test(f.leader.email.trim())) e['leader.email'] = 'Email không hợp lệ.';
  if (!f.leader.phone.trim()) e['leader.phone'] = 'Vui lòng nhập số điện thoại.';
  else if (!PHONE_RE.test(normalizePhone(f.leader.phone))) e['leader.phone'] = 'Số điện thoại không hợp lệ (VD: 0912 345 678).';
  if (!f.leader.password) e['leader.password'] = 'Vui lòng nhập mật khẩu.';
  else if (f.leader.password.length < 8) e['leader.password'] = 'Mật khẩu cần ít nhất 8 ký tự.';
  else if (!/[A-Za-z]/.test(f.leader.password) || !/\d/.test(f.leader.password))
    e['leader.password'] = 'Mật khẩu cần có cả chữ và số.';
  if (f.leader.confirmPassword !== f.leader.password) e['leader.confirmPassword'] = 'Mật khẩu nhập lại không khớp.';

  if (f.members.length > MAX_EXTRA_MEMBERS) e.members = `Tối đa ${MAX_EXTRA_MEMBERS} thành viên ngoài trưởng nhóm.`;

  const seenEmails = new Map<string, string>();
  if (EMAIL_RE.test(f.leader.email.trim())) seenEmails.set(f.leader.email.trim().toLowerCase(), 'trưởng nhóm');

  f.members.forEach((m, i) => {
    if (isBlankMember(m)) return; // dòng trống thì bỏ qua
    const p = `members.${i}`;
    set(`${p}.fullName`, checkName(m.fullName, 'họ tên'));
    const email = m.email.trim().toLowerCase();
    if (!email) e[`${p}.email`] = 'Vui lòng nhập email.';
    else if (!EMAIL_RE.test(email)) e[`${p}.email`] = 'Email không hợp lệ.';
    else if (seenEmails.has(email)) e[`${p}.email`] = `Email trùng với ${seenEmails.get(email)}.`;
    else seenEmails.set(email, `thành viên ${i + 1}`);
    if (m.phone.trim() && !PHONE_RE.test(normalizePhone(m.phone))) e[`${p}.phone`] = 'Số điện thoại không hợp lệ.';
  });

  if (!f.agree) e.agree = 'Bạn cần đồng ý với thể lệ cuộc thi.';
  return e;
}

// Chuyển dữ liệu form sang đúng hợp đồng RegisterTeamInput (bỏ dòng trống, chuẩn hoá SĐT/email).
export function toRegisterInput(f: RegisterForm): RegisterTeamInput {
  return {
    teamName: f.teamName.trim(),
    school: f.school.trim(),
    leader: {
      fullName: f.leader.fullName.trim(),
      email: f.leader.email.trim().toLowerCase(),
      phone: normalizePhone(f.leader.phone),
      password: f.leader.password,
    },
    members: f.members
      .filter((m) => !isBlankMember(m))
      .slice(0, MAX_EXTRA_MEMBERS)
      .map((m) => ({
        fullName: m.fullName.trim(),
        email: m.email.trim().toLowerCase(),
        phone: normalizePhone(m.phone),
        roleInTeam: m.roleInTeam,
      })),
  };
}
