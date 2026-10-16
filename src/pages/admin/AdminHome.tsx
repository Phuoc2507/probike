import { Link } from 'react-router-dom';
import { adminListBudget, adminListTeams } from '@/lib/api';
import { formatVnd, groupBudget } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, useLoad } from './ui';

export default function AdminHome() {
  const teams = useLoad(adminListTeams);
  const budget = useLoad(adminListBudget);

  if (teams.loading || budget.loading) return <Loading />;
  const list = teams.data ?? [];
  const count = (s: string) => list.filter((t) => t.team.status === s).length;
  const members = list.reduce((n, t) => n + t.members.length, 0);
  const stage3 = list.filter((t) => (t.progress?.stageReached ?? 1) >= 3).length;
  const total = groupBudget(budget.data ?? []).total;

  const cards = [
    { label: 'Đội đăng ký', value: list.length, sub: `${count('pending')} chờ duyệt · ${count('approved')} đã duyệt`, to: '/btc/doi' },
    { label: 'Thí sinh', value: members, sub: 'tổng thành viên các đội', to: '/btc/doi' },
    { label: 'Đội đã vào sa hình', value: stage3, sub: 'đạt giai đoạn 3', to: '/btc/tien-do' },
    { label: 'Dự toán chi phí', value: formatVnd(total), sub: `${budget.data?.length ?? 0} khoản`, to: '/btc/chi-phi' },
  ];

  return (
    <div>
      <PageTitle title="Tổng quan" sub="Trang dành riêng cho Ban tổ chức" />
      <ErrorBox text={teams.error ?? budget.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-2xl border border-line bg-surface p-5 hover:border-brand">
            <div className="text-sm text-ink-soft">{c.label}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{c.value}</div>
            <div className="mt-1 text-xs text-ink-soft">{c.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
