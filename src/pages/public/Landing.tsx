import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Code2,
  Cpu,
  GraduationCap,
  Map as MapIcon,
  Scale,
  Users,
  Wrench,
  Wallet,
  Trophy,
  ChevronDown,
} from 'lucide-react';
import BikeIllustration from '@/components/site/BikeIllustration';
import CourseMap from '@/components/site/CourseMap';
import { SectionTitle } from '@/components/site/PageHeader';

const HIGHLIGHTS = [
  { value: '2', label: 'bánh thẳng hàng, giống xe máy' },
  { value: '5', label: 'thành viên mỗi đội' },
  { value: '4 × 2,5 m', label: 'sa hình carton có vách' },
  { value: '~1 triệu đ', label: 'chi phí dự kiến mỗi đội' },
];

const STAGES = [
  {
    icon: Wrench,
    title: 'Lắp ráp xe',
    text: 'Chọn khung, kéo thả vi điều khiển, IMU, cảm biến, động cơ, bánh đà, pin lên xe 3D. Web tính khối lượng, trọng tâm, chi phí và kiểm tra luật xe.',
  },
  {
    icon: Scale,
    title: 'Lập trình cân bằng PID',
    text: 'Đọc góc nghiêng từ IMU, điều khiển bánh đà, đi từ P → PD → PID. Kéo thả khối Blockly hoặc viết code kiểu Arduino, xem biểu đồ realtime.',
  },
  {
    icon: MapIcon,
    title: 'Chạy sa hình',
    text: 'Giữ thăng bằng 30 giây để mở khoá. Chạy từng đoạn: đường thẳng, cua U, cầu bập bênh, bãi đá — rồi cả sa hình. Bấm Thi để ghi kết quả cho đội.',
  },
];

// Lịch trình tạm — BTC cần điền ngày cụ thể
const TIMELINE = [
  { title: 'Mở đăng ký', date: 'Đang cập nhật', text: 'Đăng ký đội trên website, nhận tài khoản trình mô phỏng.' },
  { title: 'Luyện tập mô phỏng', date: 'Đang cập nhật', text: 'Cả đội cùng lắp ráp, lập trình và chạy thử trong không gian chung.' },
  { title: 'Vòng mô phỏng', date: 'Đang cập nhật', text: 'Chấm điểm chạy sa hình trên web, chọn đội vào vòng xe thật.' },
  { title: 'Nhận bánh xe & chế tạo', date: 'Đang cập nhật', text: 'BTC phát bánh xe; các đội chế tạo xe thật theo luật.' },
  { title: 'Kiểm tra kỹ thuật', date: 'Đang cập nhật', text: 'Cân, đo kích thước, kiểm tra luật xe trước khi thi.' },
  { title: 'Chung kết sa hình thật', date: 'Đang cập nhật', text: 'Thi trên sa hình carton thật, trao giải.' },
];

const AUDIENCE = [
  { icon: GraduationCap, title: 'Học sinh, sinh viên', text: 'Đối tượng cụ thể (THPT, cao đẳng, đại học) BTC sẽ công bố.' },
  { icon: Users, title: 'Đội 5 người', text: 'Một trưởng nhóm đăng ký và 4 thành viên. Nên có đủ cơ khí, điện tử, lập trình.' },
  { icon: Cpu, title: 'Không cần kinh nghiệm', text: 'Trình mô phỏng hướng dẫn từng bước từ lắp ráp tới PID.' },
];

// Bộ linh kiện tham khảo — giá lấy theo kho linh kiện của trình mô phỏng
const COSTS = [
  { item: 'Vi điều khiển ESP32', price: 120_000 },
  { item: 'IMU MPU6050', price: 35_000 },
  { item: 'Động cơ bánh đà + đĩa bánh đà nhôm', price: 120_000 },
  { item: 'Động cơ kéo N20 + encoder', price: 85_000 },
  { item: 'Servo lái SG90', price: 30_000 },
  { item: '2 driver động cơ TB6612', price: 80_000 },
  { item: 'Pin 18650 ×2 + đế, mạch hạ áp', price: 130_000 },
  { item: '2 cảm biến laser ToF VL53L0X', price: 120_000 },
  { item: 'Khung (mica / in 3D), giá đỡ', price: 150_000 },
  { item: 'Dây, ốc vít, công tắc, phụ kiện', price: 80_000 },
];
const COST_TOTAL = COSTS.reduce((s, c) => s + c.price, 0);
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

const FAQ = [
  {
    q: 'Bánh xe lấy ở đâu?',
    a: 'Mọi đội dùng bánh xe do BTC phát (thông số dự kiến: đường kính 68 mm, rộng 26 mm). Trong trình mô phỏng, bánh xe BTC có sẵn và không chỉnh được kích thước.',
  },
  {
    q: 'Bánh đà (reaction wheel) là gì?',
    a: 'Là một đĩa nặng gắn động cơ, quay quanh trục dọc thân xe. Khi tăng/giảm tốc bánh đà, xe nhận mô-men ngược chiều — dùng để kéo xe về thẳng đứng khi sắp đổ.',
  },
  {
    q: 'Có bắt buộc biết lập trình không?',
    a: 'Không. Có thể kéo thả khối Blockly; ai quen code có thể viết JavaScript kiểu Arduino (setup/loop). Web còn xuất code Arduino C++ để nạp lên xe thật.',
  },
  {
    q: 'Cả đội làm chung trên web thế nào?',
    a: 'Mỗi đội có một không gian làm việc chung realtime: một người kéo khối hay sửa code thì cả đội thấy ngay; một người bấm Thi thì cả đội cùng xem lượt chạy và kết quả.',
  },
  {
    q: 'Chi phí có bị giới hạn không?',
    a: 'Ngân sách gợi ý khoảng 1.000.000 đ mỗi đội. Trình lắp ráp hiển thị tổng chi phí và cảnh báo khi vượt, nhưng không chặn.',
  },
  {
    q: 'Lệ phí tham gia?',
    a: 'Đang cập nhật — BTC sẽ thông báo.',
  },
];

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-orange-200">
              <span className="h-2 w-2 rounded-full bg-brand" /> Cuộc thi học thuật · Mùa đầu tiên
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Xe máy <span className="text-brand">tự cân bằng</span> — bạn thiết kế, bạn lập trình.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Đội 5 người tự chế tạo một chiếc xe hai bánh thẳng hàng, giữ thăng bằng bằng bánh đà và bộ điều khiển PID,
              rồi chinh phục sa hình có cua chữ U, cầu bập bênh và bãi đá.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/dang-ky"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-white shadow-lg shadow-orange-900/30 hover:bg-brand-dark"
              >
                Đăng ký đội <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/mo-phong"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10"
              >
                Thử trình mô phỏng
              </Link>
            </div>
          </div>
          <BikeIllustration className="mx-auto w-full max-w-lg" />
        </div>
        <div className="relative border-t border-white/10 bg-white/5">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 lg:grid-cols-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.label}>
                <dt className="sr-only">{h.label}</dt>
                <dd className="text-2xl font-extrabold text-white">{h.value}</dd>
                <dd className="text-sm text-slate-400">{h.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* GIỚI THIỆU */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <SectionTitle eyebrow="Giới thiệu" title="Cuộc thi ProBike là gì?">
            ProBike là sân chơi học thuật về cơ điện tử và điều khiển tự động. Bài toán: làm một chiếc xe giống xe máy —
            đúng hai bánh nằm trên một đường thẳng — tự đứng vững và tự chạy hết sa hình mà không cần ai chạm vào.
          </SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ['Thiết kế cơ khí', 'Khung, vị trí trọng tâm, cách gắn bánh đà và động cơ.'],
              ['Điện tử', 'Vi điều khiển, IMU, cảm biến khoảng cách, driver, nguồn.'],
              ['Điều khiển', 'Thuật toán PID giữ thăng bằng, lái theo vách sa hình.'],
              ['Làm việc nhóm', 'Chia việc, cùng luyện trên không gian mô phỏng chung.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="font-semibold">{t}</div>
                <div className="mt-1 text-sm text-ink-soft">{d}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3 GIAI ĐOẠN */}
      <section className="bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <SectionTitle eyebrow="Trình mô phỏng" title="Luyện tập qua 3 giai đoạn">
            Trước khi chế tạo xe thật, cả đội luyện trên trình mô phỏng có vật lý và cảm biến gần giống thật, sa hình
            đúng kích thước sa hình thi.
          </SectionTitle>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STAGES.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-line bg-white p-6 shadow-sm">
                <span className="absolute right-5 top-4 text-5xl font-black text-orange-100">{i + 1}</span>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
                  <s.icon className="h-6 w-6" />
                </span>
                <h3 className="relative mt-4 text-lg font-bold">{s.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <Code2 className="h-5 w-5 text-brand" />
            Lập trình bằng khối kéo thả hoặc JavaScript kiểu Arduino — có nút xuất code C++ cho xe thật.
          </div>
        </div>
      </section>

      {/* SA HÌNH */}
      <section id="sa-hinh" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-20">
        <SectionTitle eyebrow="Sa hình" title="Đường đua carton có vách hai bên">
          Sa hình thật làm bằng carton phủ sơn, vách trắng cao 15 cm, nền xám. Sa hình trong trình mô phỏng có cùng kích
          thước để các đội tinh chỉnh sát thực tế. Số đo hiện là đề xuất, có thể điều chỉnh.
        </SectionTitle>
        <div className="mt-8 rounded-2xl border border-line bg-surface-2 p-3 sm:p-6">
          <CourseMap />
        </div>
      </section>

      {/* LỊCH TRÌNH */}
      <section className="bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <SectionTitle eyebrow="Lịch trình" title="Các mốc chính">
            Thời gian cụ thể sẽ được BTC công bố.
          </SectionTitle>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TIMELINE.map((t, i) => (
              <li key={t.title} className="flex gap-4 rounded-xl border border-line bg-white p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand font-bold text-brand-dark">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-xs font-medium italic text-brand-dark">{t.date}</div>
                  <p className="mt-1 text-sm text-ink-soft">{t.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ĐỐI TƯỢNG + CHI PHÍ */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:py-20 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Đối tượng" title="Ai có thể tham gia?" />
          <ul className="mt-8 space-y-4">
            {AUDIENCE.map((a) => (
              <li key={a.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-brand-dark">
                  <a.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <p className="text-sm text-ink-soft">{a.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle eyebrow="Chi phí" title="Chi phí dự kiến mỗi đội" />
          <div className="mt-8 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">Bộ linh kiện tham khảo</caption>
              <tbody>
                {COSTS.map((c) => (
                  <tr key={c.item} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">{c.item}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ink-soft">{vnd(c.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-orange-50 font-bold">
                <tr>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-brand-dark" /> Tổng tham khảo</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{vnd(COST_TOTAL)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Khoảng <strong>1.000.000 đ</strong> mỗi đội (≈ 200.000 đ mỗi người). Bánh xe do BTC phát miễn phí. Đây là
            bộ tham khảo — đội được tự chọn linh kiện.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="hoi-dap" className="scroll-mt-16 bg-surface-2">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <SectionTitle eyebrow="Hỏi đáp" title="Câu hỏi thường gặp" />
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-line bg-white p-5 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            Xem đầy đủ luật xe, cách chấm điểm và vòng thi ở trang{' '}
            <Link to="/the-le" className="font-semibold text-brand-dark underline">Thể lệ</Link>.
          </p>
        </div>
      </section>

      {/* KÊU GỌI ĐĂNG KÝ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-12 text-white sm:px-12">
          <Trophy className="pointer-events-none absolute -right-6 -top-6 h-48 w-48 text-white/10" />
          <h2 className="relative text-3xl font-extrabold tracking-tight">Sẵn sàng giữ thăng bằng?</h2>
          <p className="relative mt-3 max-w-xl text-orange-50">
            Lập đội 5 người, đăng ký ngay để nhận tài khoản không gian làm việc chung và bắt đầu luyện tập trên trình mô
            phỏng.
          </p>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <Link to="/dang-ky" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-brand-dark hover:bg-orange-50">
              Đăng ký đội <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/giai-thuong" className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 font-semibold hover:bg-white/10">
              Xem giải thưởng
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
