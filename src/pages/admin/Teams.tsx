import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Download, Search, RotateCcw } from 'lucide-react';
import type { Team } from '@/shared/types';
import { adminListTeams, adminSetTeamStatus, type AdminTeam } from '@/lib/api';
import { downloadText, formatDateTime, toCsv } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, STAGE_LABEL, STATUS_LABEL, StatusBadge, btn, useLoad } from './ui';

type Filter = 'all' | Team['status'];

/** Bỏ dấu tiếng Việt để tìm kiếm "truong" khớp "Trường". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export function teamMatches(t: AdminTeam, q: string): boolean {
  if (!q.trim()) return true;
  const hay = fold([t.team.name, t.team.school, ...t.members.flatMap((m) => [m.fullName, m.email, m.phone])].join(' '));
  return fold(q).trim().split(/\s+/).every((w) => hay.includes(w));
}

export default function Teams() {
  const { data, setData, error, setError, loading } = useLoad(adminListTeams);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(
    () => (data ?? []).filter((t) => (filter === 'all' || t.team.status === filter) && teamMatches(t, q)),
    [data, q, filter],
  );

  async function setStatus(t: AdminTeam, status: Team['status']) {
    setBusy(t.team.id);
    const r = await adminSetTeamStatus(t.team.id, status);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setData((all) => (all ?? []).map((x) => (x.team.id === t.team.id ? { ...x, team: { ...x.team, status } } : x)));
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Đội', 'Trường', 'Trạng thái', 'Ngày đăng ký', 'Giai đoạn', 'Họ tên', 'Vai trò', 'Email', 'SĐT', 'Đã có tài khoản'],
    ];
    for (const t of list) {
      for (const m of t.members) {
        rows.push([
          t.team.name, t.team.school, STATUS_LABEL[t.team.status], formatDateTime(t.team.createdAt),
          t.progress?.stageReached ?? 1, m.fullName, m.roleInTeam, m.email, m.phone, m.userId ? 'có' : 'chưa',
        ]);
      }
    }
    downloadText(`doi-dang-ky-probike-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  if (loading) return <Loading />;
  const all = data ?? [];
  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'Tất cả', n: all.length },
    { key: 'pending', label: 'Chờ duyệt', n: all.filter((t) => t.team.status === 'pending').length },
    { key: 'approved', label: 'Đã duyệt', n: all.filter((t) => t.team.status === 'approved').length },
    { key: 'rejected', label: 'Từ chối', n: all.filter((t) => t.team.status === 'rejected').length },
  ];

  return (
    <div>
      <PageTitle
        title="Đội đăng ký"
        sub={`${list.length} / ${all.length} đội`}
        right={<button className={btn} onClick={exportCsv} disabled={!list.length}><Download size={16} /> Xuất CSV</button>}
      />
      <ErrorBox text={error} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên đội, trường, thành viên, email, SĐT…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="flex rounded-lg bg-surface p-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1 ${filter === t.key ? 'bg-brand/10 font-semibold text-brand-dark' : 'text-ink-soft'}`}
            >
              {t.label} <span className="text-xs">({t.n})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2">Đội</th>
              <th className="px-3 py-2">Trưởng nhóm</th>
              <th className="px-3 py-2 text-center">TV</th>
              <th className="px-3 py-2">Giai đoạn</th>
              <th className="px-3 py-2">Đăng ký</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right">Duyệt</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const leader = t.members.find((m) => m.userId && m.userId === t.team.leaderId) ?? t.members[0];
              return (
                <tr key={t.team.id} className="border-t border-line hover:bg-surface-2/50">
                  <td className="px-3 py-2">
                    <Link to={`/btc/doi/${t.team.id}`} className="font-semibold text-ink hover:text-brand-dark">{t.team.name}</Link>
                    <div className="text-xs text-ink-soft">{t.team.school}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{leader?.fullName ?? '—'}</div>
                    <div className="text-xs text-ink-soft">{leader?.email} {leader?.phone && `· ${leader.phone}`}</div>
                  </td>
                  <td className="px-3 py-2 text-center">{t.members.length}</td>
                  <td className="px-3 py-2">{STAGE_LABEL[t.progress?.stageReached ?? 1]}</td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{formatDateTime(t.team.createdAt)}</td>
                  <td className="px-3 py-2"><StatusBadge status={t.team.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {t.team.status !== 'approved' && (
                        <button disabled={busy === t.team.id} onClick={() => void setStatus(t, 'approved')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                          <Check size={14} /> Duyệt
                        </button>
                      )}
                      {t.team.status !== 'rejected' && (
                        <button disabled={busy === t.team.id} onClick={() => void setStatus(t, 'rejected')} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                          <X size={14} /> Từ chối
                        </button>
                      )}
                      {t.team.status !== 'pending' && (
                        <button disabled={busy === t.team.id} onClick={() => void setStatus(t, 'pending')} title="Đưa về chờ duyệt" className="rounded-md p-1 text-ink-soft hover:bg-surface-2 disabled:opacity-50">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-8 text-center text-ink-soft">Không có đội nào phù hợp.</p>}
      </div>
    </div>
  );
}
