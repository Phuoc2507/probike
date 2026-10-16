import { Outlet } from 'react-router-dom';

// Khung tạm trang BTC — session Backend sẽ thêm kiểm tra quyền admin và menu.
export default function AdminLayout() {
  return <div className="min-h-full"><Outlet /></div>;
}
