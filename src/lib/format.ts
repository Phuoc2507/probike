// Tiện ích định dạng & kiểm tra thuần (không cần mạng), có test.
import type { RegisterTeamInput } from './api';

const vnd = new Intl.NumberFormat('vi-VN');

/** 1500000 → "1.500.000 đ" */
export function formatVnd(n: number): string {
  return `${vnd.format(Math.round(Number.isFinite(n) ? n : 0))} đ`;
}

/** Đọc số người dùng gõ kiểu Việt: "1.500.000", "1500000", "2,5" → số. */
export function parseVietNumber(text: string): number {
  const t = text.replace(/\s|đ/g, '').trim();
  if (!t) return 0;
  // Có dấu phẩy → phẩy là dấu thập phân, chấm là phân cách nghìn
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function isEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

/** Kiểm tra form đăng ký phía client. Trả thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validateRegistration(input: RegisterTeamInput): string | null {
  if (input.teamName.trim().length < 2) return 'Tên đội cần ít nhất 2 ký tự';
  if (input.teamName.trim().length > 80) return 'Tên đội tối đa 80 ký tự';
  if (!input.school.trim()) return 'Vui lòng nhập tên trường';
  if (!input.leader.fullName.trim()) return 'Vui lòng nhập họ tên trưởng nhóm';
  if (!isEmail(input.leader.email)) return 'Email trưởng nhóm không hợp lệ';
  if (input.leader.password.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự';
  if (input.members.length > 4) return 'Mỗi đội tối đa 5 người (trưởng nhóm + 4 thành viên)';
  const seen = new Set([normEmail(input.leader.email)]);
  for (const [i, m] of input.members.entries()) {
    if (!m.fullName.trim()) return `Thành viên ${i + 2}: thiếu họ tên`;
    if (!isEmail(m.email)) return `Thành viên ${i + 2}: email không hợp lệ`;
    const e = normEmail(m.email);
    if (seen.has(e)) return `Email bị trùng: ${e}`;
    seen.add(e);
  }
  return null;
}

/** Tạo nội dung CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export interface BudgetLike { category: string; qty: number; unitPrice: number; sort: number }

/** Nhóm dòng chi phí theo hạng mục, giữ thứ tự xuất hiện đầu tiên của hạng mục, tính tổng. */
export function groupBudget<T extends BudgetLike>(items: T[]) {
  const groups: { category: string; items: T[]; total: number }[] = [];
  const byCat = new Map<string, (typeof groups)[number]>();
  for (const it of [...items].sort((a, b) => a.sort - b.sort)) {
    let g = byCat.get(it.category);
    if (!g) {
      g = { category: it.category, items: [], total: 0 };
      byCat.set(it.category, g);
      groups.push(g);
    }
    g.items.push(it);
    g.total += lineTotal(it);
  }
  return { groups, total: groups.reduce((s, g) => s + g.total, 0) };
}

export function lineTotal(it: { qty: number; unitPrice: number }): number {
  return (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
}

/** Ánh xạ thông báo lỗi Supabase/Postgres sang tiếng Việt dễ hiểu. */
export function friendlyError(message: string | undefined | null): string {
  const m = message ?? '';
  if (/Invalid login credentials/i.test(m)) return 'Email hoặc mật khẩu không đúng';
  if (/Email not confirmed/i.test(m)) return 'Email chưa được xác nhận — hãy mở thư xác nhận trong hộp thư';
  if (/User already registered/i.test(m)) return 'Email này đã có tài khoản — hãy đăng nhập';
  if (/Database error saving new user/i.test(m)) return 'Không tạo được đội: tên đội hoặc email thành viên đã được dùng';
  if (/rate limit|too many/i.test(m)) return 'Thao tác quá nhanh, vui lòng thử lại sau ít phút';
  if (/Password should be at least/i.test(m)) return 'Mật khẩu quá ngắn';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Không kết nối được máy chủ, kiểm tra mạng';
  if (/duplicate key|unique/i.test(m)) return 'Dữ liệu bị trùng (tên đội hoặc email đã tồn tại)';
  return m || 'Đã có lỗi xảy ra';
}
