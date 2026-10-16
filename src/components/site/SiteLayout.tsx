import { Link, NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Trang chủ' },
  { to: '/the-le', label: 'Thể lệ' },
  { to: '/giai-thuong', label: 'Giải thưởng' },
  { to: '/mo-phong', label: 'Mô phỏng' },
];

// Khung tạm — session "Trang công khai" sẽ thiết kế lại.
export default function SiteLayout() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link to="/" className="font-bold text-lg">ProBike</Link>
          <nav className="flex gap-4 text-sm text-ink-soft">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? 'text-ink font-semibold' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/dang-ky" className="ml-auto rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">Đăng ký</Link>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-6 text-center text-sm text-ink-soft">© ProBike</footer>
    </div>
  );
}
