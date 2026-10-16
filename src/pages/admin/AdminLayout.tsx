import { Link, NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Wallet, Users, TrendingUp, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

const NAV = [
  { to: '/btc', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/btc/chi-phi', label: 'Chi phí tổ chức', icon: Wallet, end: false },
  { to: '/btc/doi', label: 'Đội đăng ký', icon: Users, end: false },
  { to: '/btc/tien-do', label: 'Tiến độ', icon: TrendingUp, end: false },
];

/** Trang 404 "giả" — người không phải admin không biết /btc tồn tại. */
export function FakeNotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <div className="text-6xl font-bold text-line">404</div>
      <h1 className="text-xl font-semibold text-ink">Không tìm thấy trang</h1>
      <p className="text-ink-soft">Đường dẫn bạn truy cập không tồn tại hoặc đã bị xoá.</p>
      <Link to="/" className="mt-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white">Về trang chủ</Link>
    </div>
  );
}

export default function AdminLayout() {
  const auth = useAuth();
  if (auth.loading) return <div className="p-10 text-center text-ink-soft">Đang tải…</div>;
  if (!auth.isAdmin) return <FakeNotFound />;

  return (
    <div className="flex min-h-full flex-col bg-surface-2 md:flex-row">
      <aside className="border-b border-line bg-surface md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <Link to="/" className="font-bold">ProBike</Link>
          <span className="rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-white">BTC</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand/10 font-semibold text-brand-dark' : 'text-ink-soft hover:bg-surface-2'}`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-4 pb-4 text-xs text-ink-soft md:block">
          <div className="truncate">{auth.user?.email}</div>
          <button onClick={() => void auth.signOut()} className="mt-2 inline-flex items-center gap-1 hover:text-ink">
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
