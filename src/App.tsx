import { Route, Routes } from 'react-router-dom';
import SiteLayout from '@/components/site/SiteLayout';
import Landing from '@/pages/public/Landing';
import Register from '@/pages/public/Register';
import Rules from '@/pages/public/Rules';
import Prizes from '@/pages/public/Prizes';
import Login from '@/pages/auth/Login';
import SimPage from '@/pages/sim/SimPage';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminHome from '@/pages/admin/AdminHome';
import Costs from '@/pages/admin/Costs';
import Teams from '@/pages/admin/Teams';
import TeamDetail from '@/pages/admin/TeamDetail';
import Progress from '@/pages/admin/Progress';

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
      <Route path="mo-phong/*" element={<SimPage />} />
      {/* Trang ẩn của BTC — không có link trên menu */}
      <Route path="btc" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="chi-phi" element={<Costs />} />
        <Route path="doi" element={<Teams />} />
        <Route path="doi/:id" element={<TeamDetail />} />
        <Route path="tien-do" element={<Progress />} />
      </Route>
    </Routes>
  );
}
