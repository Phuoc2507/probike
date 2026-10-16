import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import SiteLayout from '@/components/site/SiteLayout';
import Landing from '@/pages/public/Landing';
import Register from '@/pages/public/Register';
import Rules from '@/pages/public/Rules';
import Prizes from '@/pages/public/Prizes';
import Login from '@/pages/auth/Login';

// Trang nặng (three.js, Rapier, Blockly, Recharts) và trang BTC tải riêng khi cần
const SimPage = lazy(() => import('@/pages/sim/SimPage'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminHome = lazy(() => import('@/pages/admin/AdminHome'));
const Costs = lazy(() => import('@/pages/admin/Costs'));
const Teams = lazy(() => import('@/pages/admin/Teams'));
const TeamDetail = lazy(() => import('@/pages/admin/TeamDetail'));
const Progress = lazy(() => import('@/pages/admin/Progress'));

function Loading({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center p-10 text-ink-soft">Đang tải…</div>}>
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Landing />} />
        <Route path="dang-ky" element={<Register />} />
        <Route path="dang-nhap" element={<Login />} />
        <Route path="the-le" element={<Rules />} />
        <Route path="giai-thuong" element={<Prizes />} />
      </Route>
      {/* Trình mô phỏng dùng toàn màn hình, không có footer */}
      <Route path="mo-phong/*" element={<Loading><SimPage /></Loading>} />
      {/* Trang ẩn của BTC — không có link trên menu */}
      <Route path="btc" element={<Loading><AdminLayout /></Loading>}>
        <Route index element={<Loading><AdminHome /></Loading>} />
        <Route path="chi-phi" element={<Loading><Costs /></Loading>} />
        <Route path="doi" element={<Loading><Teams /></Loading>} />
        <Route path="doi/:id" element={<Loading><TeamDetail /></Loading>} />
        <Route path="tien-do" element={<Loading><Progress /></Loading>} />
      </Route>
    </Routes>
  );
}
