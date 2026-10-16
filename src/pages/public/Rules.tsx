import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/site/PageHeader';
import CourseMap from '@/components/site/CourseMap';

const TOC = [
  { id: 'luat-xe', label: '1. Luật xe' },
  { id: 'sa-hinh', label: '2. Sa hình' },
  { id: 'cham-diem', label: '3. Cách chấm điểm' },
  { id: 'vong-thi', label: '4. Vòng thi' },
  { id: 'lam-viec-nhom', label: '5. Làm việc nhóm' },
  { id: 'nop-bai', label: '6. Nộp bài' },
  { id: 'khieu-nai', label: '7. Khiếu nại' },
];

// Theo dõi mục đang đọc để tô sáng trong mục lục
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-line pb-10 pt-2 last:border-0">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Draft({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const ul = 'list-disc space-y-1.5 pl-5 marker:text-brand';
const th = 'border-b border-line bg-surface-2 px-3 py-2 text-left font-semibold text-ink';
const td = 'border-b border-line px-3 py-2 align-top';

export default function Rules() {
  const active = useActiveSection(TOC.map((t) => t.id));

  return (
    <>
      <PageHeader eyebrow="Thể lệ" title="Thể lệ cuộc thi ProBike">
        Bản dự thảo — BTC có thể điều chỉnh trước khi mở đăng ký chính thức. Mọi thay đổi sẽ được thông báo trên website.
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[220px_1fr] lg:py-14">
        {/* Mục lục: bám dính bên trái trên desktop, cuộn ngang trên mobile */}
        <nav aria-label="Mục lục thể lệ" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wider text-ink-soft lg:block">Mục lục</p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {TOC.map((t) => (
              <li key={t.id} className="shrink-0">
                <a
                  href={`#${t.id}`}
                  className={`block whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors lg:rounded-md lg:border-0 lg:border-l-2 lg:py-2 ${
                    active === t.id
                      ? 'border-brand bg-orange-50 font-semibold text-brand-dark'
                      : 'border-line text-ink-soft hover:text-ink lg:border-transparent'
                  }`}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 space-y-10">
          <Section id="luat-xe" title="1. Luật xe">
            <p>Xe dự thi phải là xe <strong className="text-ink">giống xe máy</strong>, tự giữ thăng bằng và tự chạy.</p>
            <ul className={ul}>
              <li>Đúng <strong className="text-ink">2 bánh</strong>, hai bánh nằm trên cùng một đường thẳng (đồng phẳng, không lệch ngang).</li>
              <li>
                Chỉ dùng <strong className="text-ink">bánh xe do BTC phát</strong>. Thông số dự kiến: đường kính 68 mm, rộng 26 mm, cao su,
                35 g (sẽ cập nhật khi BTC chốt bánh thật).
              </li>
              <li>Bánh sau (hoặc trước) có thể gắn động cơ kéo; bánh trước có thể gắn servo lái (không bắt buộc).</li>
              <li>Cân bằng bằng <strong className="text-ink">bánh đà (reaction wheel)</strong> — khuyến nghị.</li>
              <li>Không có bánh phụ, chân chống hay bất kỳ bộ phận nào khác chạm đất khi chạy.</li>
              <li>Kích thước tối đa: dài 35 cm × rộng 15 cm × cao 30 cm. Khối lượng tối đa 1,5 kg.</li>
              <li>Xe chạy hoàn toàn tự động; không điều khiển từ xa trong lượt chạy.</li>
              <li>
                Ngân sách gợi ý <strong className="text-ink">≤ 1.000.000 đ</strong> mỗi đội. Trình lắp ráp cảnh báo khi vượt ngân sách
                nhưng không chặn.
              </li>
            </ul>
          </Section>

          <Section id="sa-hinh" title="2. Sa hình">
            <p>
              Sa hình làm bằng carton phủ sơn, kích thước tổng 4,0 m × 2,5 m. Lòng đường rộng 50 cm, vách trắng cao 15 cm hai
              bên, nền xám. Sa hình trong trình mô phỏng có cùng kích thước.
            </p>
            <div className="rounded-xl border border-line bg-surface-2 p-3 sm:p-5">
              <CourseMap showLegend={false} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border border-line text-sm">
                <thead>
                  <tr><th className={th}>Đoạn</th><th className={th}>Mô tả</th><th className={th}>Checkpoint</th></tr>
                </thead>
                <tbody>
                  <tr><td className={td}>1. Xuất phát</td><td className={td}>Đoạn thẳng 1,2 m, ô xuất phát có vạch.</td><td className={td}>CP1</td></tr>
                  <tr><td className={td}>2. Cua chữ U</td><td className={td}>Bán kính tâm đường 60 cm, quay đầu 180°.</td><td className={td}>CP2</td></tr>
                  <tr>
                    <td className={td}>3. Cầu bập bênh</td>
                    <td className={td}>
                      Dài 1,0 m, rộng 25 cm, trục xoay giữa cầu, nghiêng tối đa ±10°, dốc lên cao 8 cm. Hai bên cầu không có vách.
                    </td>
                    <td className={td}>CP3</td>
                  </tr>
                  <tr><td className={td}>4. Bãi đá</td><td className={td}>Dài 80 cm, đá dăm/sỏi dán cố định, cao 0,5–1,5 cm.</td><td className={td}>CP4</td></tr>
                  <tr><td className={td}>5. Đích</td><td className={td}>Đoạn thẳng 0,8 m, vạch đích.</td><td className={td}>CP5 (về đích)</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="cham-diem" title="3. Cách chấm điểm">
            <Draft>
              <strong>Bản dự thảo.</strong> Thang điểm, mức phạt và giới hạn thời gian dưới đây là đề xuất để các đội tham khảo khi
              luyện tập; BTC sẽ chốt trước vòng thi.
            </Draft>
            <p>Mỗi lượt chạy tối đa <strong className="text-ink">3 phút</strong>. Điểm lượt = điểm đoạn + điểm thời gian − điểm phạt.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border border-line text-sm">
                <thead><tr><th className={th}>Hạng mục</th><th className={th}>Điểm</th></tr></thead>
                <tbody>
                  <tr><td className={td}>Qua CP1 — xuất phát</td><td className={td}>10</td></tr>
                  <tr><td className={td}>Qua CP2 — cua chữ U</td><td className={td}>20</td></tr>
                  <tr><td className={td}>Qua CP3 — cầu bập bênh</td><td className={td}>30</td></tr>
                  <tr><td className={td}>Qua CP4 — bãi đá</td><td className={td}>25</td></tr>
                  <tr><td className={td}>Về đích (CP5)</td><td className={td}>15</td></tr>
                  <tr>
                    <td className={td}>Điểm thời gian (chỉ khi về đích)</td>
                    <td className={td}>tối đa 20 = 20 × (thời gian nhanh nhất ÷ thời gian của đội)</td>
                  </tr>
                </tbody>
                <tfoot><tr><td className={`${td} font-semibold text-ink`}>Tối đa</td><td className={`${td} font-semibold text-ink`}>120</td></tr></tfoot>
              </table>
            </div>
            <p className="font-semibold text-ink">Phạt (dự thảo)</p>
            <ul className={ul}>
              <li>Chạm vách: −1 điểm mỗi lần (tối đa −10).</li>
              <li>Xe đổ: đặt lại tại checkpoint gần nhất phía sau, −3 điểm mỗi lần.</li>
              <li>Rơi khỏi cầu bập bênh: quay lại đầu cầu, −5 điểm.</li>
              <li>Thành viên chạm tay vào xe khi đang chạy (ngoài lần đặt lại được phép): −5 điểm mỗi lần.</li>
              <li>Hết 3 phút: tính điểm tới checkpoint cuối cùng đã qua.</li>
            </ul>
            <p>Mỗi đội có tối đa <strong className="text-ink">3 lượt</strong> ở vòng chung kết; lấy lượt điểm cao nhất. Bằng điểm thì xét thời gian nhanh hơn.</p>
          </Section>

          <Section id="vong-thi" title="4. Vòng thi">
            <ol className="list-decimal space-y-3 pl-5 marker:font-bold marker:text-brand">
              <li>
                <strong className="text-ink">Vòng mô phỏng (online).</strong> Đội chạy sa hình đầy đủ trên trình mô phỏng, bấm{' '}
                <em>Thi</em> để ghi kết quả. BTC chọn các đội có điểm cao vào vòng tiếp theo. Thời gian: <em>Đang cập nhật</em>.
              </li>
              <li>
                <strong className="text-ink">Kiểm tra kỹ thuật.</strong> Cân, đo kích thước, kiểm tra luật xe (mục 1) và bánh BTC. Xe
                không đạt được sửa trong thời gian BTC cho phép. Thời gian: <em>Đang cập nhật</em>.
              </li>
              <li>
                <strong className="text-ink">Chung kết sa hình thật.</strong> Chạy trên sa hình carton theo cách chấm điểm ở mục 3.
                Thời gian, địa điểm: <em>Đang cập nhật</em>.
              </li>
            </ol>
          </Section>

          <Section id="lam-viec-nhom" title="5. Làm việc nhóm">
            <ul className={ul}>
              <li>Mỗi đội tối đa <strong className="text-ink">5 thành viên</strong>, gồm 1 trưởng nhóm đăng ký trên website.</li>
              <li>Một thí sinh chỉ thuộc một đội.</li>
              <li>
                Mỗi đội có một <strong className="text-ink">không gian làm việc chung realtime</strong> trên trình mô phỏng: thiết kế
                xe, chương trình và thông số PID được đồng bộ cho cả đội. Khi một người bấm <em>Thi</em>, cả đội cùng xem lượt chạy
                và nhận kết quả.
              </li>
              <li>Trưởng nhóm chịu trách nhiệm liên lạc với BTC và thay mặt đội nộp bài, khiếu nại.</li>
              <li>Thay đổi thành viên sau khi đăng ký: liên hệ BTC (quy định cụ thể <em>đang cập nhật</em>).</li>
            </ul>
          </Section>

          <Section id="nop-bai" title="6. Nộp bài">
            <Draft>Hình thức và hạn nộp cụ thể đang được BTC hoàn thiện.</Draft>
            <ul className={ul}>
              <li>Vòng mô phỏng: kết quả lượt <em>Thi</em> tốt nhất của đội được lưu tự động trên hệ thống.</li>
              <li>Thiết kế xe (danh sách linh kiện, chi phí) được lấy từ không gian làm việc chung của đội.</li>
              <li>Trước chung kết: nộp mã nguồn chạy trên xe thật và ảnh/video xe hoàn thiện. Hạn nộp: <em>Đang cập nhật</em>.</li>
              <li>Mã nguồn phải do đội tự viết; được dùng thư viện công khai và phải ghi nguồn.</li>
            </ul>
          </Section>

          <Section id="khieu-nai" title="7. Khiếu nại">
            <ul className={ul}>
              <li>Trưởng nhóm gửi khiếu nại tới BTC trong vòng <strong className="text-ink">15 phút</strong> sau khi công bố kết quả lượt chạy (dự thảo).</li>
              <li>Khiếu nại nêu rõ lượt chạy, nội dung và bằng chứng (video, ảnh) nếu có.</li>
              <li>Quyết định của Ban giám khảo là quyết định cuối cùng.</li>
              <li>Kênh tiếp nhận khiếu nại: <em>Đang cập nhật</em>.</li>
            </ul>
            <p>
              Còn thắc mắc? Xem phần <Link to="/#hoi-dap" className="font-semibold text-brand-dark underline">hỏi đáp trên trang chủ</Link>{' '}
              hoặc liên hệ BTC.
            </p>
          </Section>
        </article>
      </div>
    </>
  );
}
