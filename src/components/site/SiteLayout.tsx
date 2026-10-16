import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from './Logo';

const NAV = [
  { to: '/', label: 'Trang chủ' },
  { to: '/the-le', label: 'Thể lệ' },
  { to: '/giai-thuong', label: 'Giải thưởng' },
  { to: '/mo-phong', label: 'Mô phỏng' },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'text-brand-dark bg-orange-50' : 'text-ink-soft hover:text-ink hover:bg-surface-2'
  }`;

// Cuộn về đầu trang khi đổi trang; nếu có #hash thì cuộn tới phần tử đó.
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
}

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useScrollOnNavigate();

  // Đóng menu mobile khi chuyển trang
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Menu chính">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              to="/dang-nhap"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              Đăng nhập
            </Link>
            <Link
              to="/dang-ky"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
            >
              Đăng ký đội
            </Link>
          </div>
          <button
            type="button"
            className="ml-auto rounded-md p-2 text-ink hover:bg-surface-2 md:hidden"
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-line bg-white md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Menu di động">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={navClass}>
                  {n.label}
                </NavLink>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  to="/dang-nhap"
                  className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-semibold text-ink"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/dang-ky"
                  className="rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Đăng ký đội
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-ink text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Logo light />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Cuộc thi học thuật thiết kế và lập trình xe máy tự cân bằng bằng bánh đà. Tự lắp ráp, tự viết bộ điều
              khiển PID, chinh phục sa hình thật.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Cuộc thi</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" to="/the-le">Thể lệ</Link></li>
              <li><Link className="hover:text-white" to="/giai-thuong">Giải thưởng</Link></li>
              <li><Link className="hover:text-white" to="/mo-phong">Trình mô phỏng</Link></li>
              <li><Link className="hover:text-white" to="/dang-ky">Đăng ký đội</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Liên hệ BTC</h2>
            {/* BTC cần điền thông tin liên hệ thật */}
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>Email: <span className="italic">Đang cập nhật</span></li>
              <li>Điện thoại: <span className="italic">Đang cập nhật</span></li>
              <li>Fanpage: <span className="italic">Đang cập nhật</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} ProBike — Cuộc thi xe máy tự cân bằng
        </div>
      </footer>
    </div>
  );
}
