import { Link } from 'react-router-dom';
import { Award, Coins, Gauge, Medal, Palette, Timer, Trophy, Users, Monitor } from 'lucide-react';
import PageHeader from '@/components/site/PageHeader';

// Giá trị giải và số lượng: BTC cần điền
const MAIN_PRIZES = [
  { rank: 'Giải Nhất', count: '01 giải', value: 'Đang cập nhật', style: 'from-amber-300 to-yellow-500 text-amber-950', icon: Trophy, big: true },
  { rank: 'Giải Nhì', count: '01 giải', value: 'Đang cập nhật', style: 'from-slate-200 to-slate-400 text-slate-900', icon: Medal },
  { rank: 'Giải Ba', count: '01 giải', value: 'Đang cập nhật', style: 'from-orange-300 to-amber-700 text-orange-950', icon: Medal },
  { rank: 'Giải Khuyến khích', count: 'Đang cập nhật', value: 'Đang cập nhật', style: 'from-sky-200 to-sky-400 text-sky-950', icon: Award },
];

const SIDE_PRIZES = [
  { icon: Timer, title: 'Về đích nhanh nhất', text: 'Lượt chạy về đích với thời gian ngắn nhất ở chung kết.' },
  { icon: Gauge, title: 'Cân bằng vững nhất', text: 'Giữ thăng bằng tại chỗ lâu nhất trong bài thử có nhiễu đẩy.' },
  { icon: Palette, title: 'Thiết kế ấn tượng', text: 'Xe đẹp, gọn, sáng tạo về cơ khí do Ban giám khảo bình chọn.' },
  { icon: Coins, title: 'Tối ưu chi phí', text: 'Chi phí linh kiện thấp nhất trong các đội về đích.' },
  { icon: Monitor, title: 'Xuất sắc vòng mô phỏng', text: 'Điểm cao nhất trên sa hình đầy đủ của trình mô phỏng.' },
  { icon: Users, title: 'Tinh thần đồng đội', text: 'Đội phối hợp tốt nhất trong suốt quá trình luyện tập và thi.' },
];

export default function Prizes() {
  return (
    <>
      <PageHeader eyebrow="Giải thưởng" title="Cơ cấu giải thưởng">
        Giá trị giải thưởng đang được BTC cập nhật. Cơ cấu dưới đây là dự kiến và có thể thay đổi.
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-extrabold tracking-tight">Giải chính</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MAIN_PRIZES.map((p) => (
            <div
              key={p.rank}
              className={`relative overflow-hidden rounded-2xl border border-line bg-white shadow-sm ${p.big ? 'ring-2 ring-amber-400' : ''}`}
            >
              <div className={`flex items-center gap-3 bg-gradient-to-br px-5 py-6 ${p.style}`}>
                <p.icon className="h-10 w-10" />
                <div>
                  <div className="text-xl font-extrabold">{p.rank}</div>
                  <div className="text-sm font-medium opacity-80">{p.count}</div>
                </div>
              </div>
              <dl className="space-y-2 p-5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Tiền thưởng</dt>
                  <dd className="font-semibold italic">{p.value}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Hiện vật</dt>
                  <dd className="font-semibold italic">Đang cập nhật</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Kèm theo</dt>
                  <dd className="font-semibold">Giấy chứng nhận</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <h2 className="mt-16 text-2xl font-extrabold tracking-tight">Giải phụ</h2>
        <p className="mt-2 text-ink-soft">Một đội có thể nhận cả giải chính và giải phụ. Giá trị mỗi giải phụ: <em>Đang cập nhật</em>.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIDE_PRIZES.map((s) => (
            <div key={s.title} className="flex gap-4 rounded-xl border border-line bg-white p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-brand-dark">
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="mt-1 text-sm text-ink-soft">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 rounded-2xl bg-surface-2 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-bold">Chứng nhận tham gia</h2>
            <p className="mt-2 text-ink-soft">
              Tất cả đội hoàn thành vòng mô phỏng đều nhận giấy chứng nhận tham gia. Xếp hạng dựa theo{' '}
              <Link to="/the-le#cham-diem" className="font-semibold text-brand-dark underline">cách chấm điểm</Link> trong thể lệ.
            </p>
          </div>
          <Link to="/dang-ky" className="rounded-lg bg-brand px-6 py-3 text-center font-semibold text-white hover:bg-brand-dark">
            Đăng ký đội
          </Link>
        </div>
      </div>
    </>
  );
}
