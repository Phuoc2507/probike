import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminListTeams, adminRunCounts } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, StatusBadge, useLoad } from './ui';

type SortKey = 'stage' | 'score' | 'balance' | 'runs' | 'name';

const STAGES = [
  { n: 1, label: 'Lắp ráp' },
  { n: 2, label: 'Cân bằng' },
  { n: 3, label: 'Sa hình' },
];

export default function Progress() {
  const teams = useLoad(adminListTeams);
  const runs = useLoad(adminRunCounts);
  const [sort, setSort] = useState<SortKey>('stage');
  const [onlyApproved, setOnlyApproved] = useState(false);

  const rows = useMemo(() => {
    const list = (teams.data ?? [])
      .filter((t) => !onlyApproved || t.team.status === 'approved')
      .map((t) => ({
        t,
        stage: t.progress?.stageReached ?? 1,
        score: t.progress?.bestScore ?? 0,
        balance: t.progress?.balanceBestS ?? 0,
        runs: runs.data?.[t.team.id]?.count ?? 0,
        lastRun: runs.data?.[t.team.id]?.lastAt ?? null,
      }));
    const cmp: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      stage: (a, b) => b.stage - a.stage || b.score - a.score || b.balance - a.balance,
      score: (a, b) => b.score - a.score,
      balance: (a, b) => b.balance - a.balance,
      runs: (a, b) => b.runs - a.runs,
      name: (a, b) => a.t.team.name.localeCompare(b.t.team.name, 'vi'),
    };
    return list.sort(cmp[sort]);
  }, [teams.data, runs.data, sort, onlyApproved]);

  if (teams.loading) return <Loading />;
  const counts = STAGES.map((s) => rows.filter((r) => r.stage === s.n).length);
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2 ${cls} ${sort === k ? 'text-brand-dark' : ''}`} onClick={() => setSort(k)}>
      {label}{sort === k ? ' ↓' : ''}
    </th>
  );

  return (
    <div>
      <PageTitle
        title="Tiến độ các đội"
        sub="Giai đoạn đạt được, thời gian giữ thăng bằng và điểm tốt nhất"
        right={
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> Chỉ đội đã duyệt
          </label>
        }
      />
      <ErrorBox text={teams.error ?? runs.error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {STAGES.map((s, i) => (
          <div key={s.n} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm text-ink-soft">Giai đoạn {s.n} · {s.label}</div>
            <div className="text-2xl font-bold">{counts[i]} <span className="text-sm font-normal text-ink-soft">đội</span></div>
            <div className="mt-2 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${rows.length ? (counts[i] / rows.length) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="w-10 px-3 py-2">#</th>
              {th('name', 'Đội')}
              {th('stage', 'Giai đoạn')}
              {th('balance', 'Cân bằng tốt nhất', 'text-right')}
              {th('score', 'Điểm tốt nhất', 'text-right')}
              {th('runs', 'Lượt chạy', 'text-right')}
              <th className="px-3 py-2">Chạy gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.t.team.id} className="border-t border-line hover:bg-surface-2/50">
                <td className="px-3 py-2 text-ink-soft">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link to={`/btc/doi/${r.t.team.id}`} className="font-semibold hover:text-brand-dark">{r.t.team.name}</Link>{' '}
                  <StatusBadge status={r.t.team.status} />
                  <div className="text-xs text-ink-soft">{r.t.team.school}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {STAGES.map((s) => (
                      <span key={s.n} title={s.label} className={`h-2 w-8 rounded-full ${r.stage >= s.n ? 'bg-brand' : 'bg-surface-2'}`} />
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">{STAGES[r.stage - 1]?.label}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.balance.toFixed(1)} s</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.score}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.runs}</td>
                <td className="px-3 py-2 text-xs text-ink-soft">{formatDateTime(r.lastRun)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-ink-soft">Chưa có đội nào.</p>}
      </div>
    </div>
  );
}
