// Bài hướng dẫn cân bằng từng bước (dữ liệu từ src/code/samples/tutorial) + bước cuối là mẫu hoàn chỉnh
// đã chỉnh cho xe mô phỏng. Bước có tiêu chí giữ thăng bằng tự đánh dấu hoàn thành theo kết quả tốt nhất.
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Lightbulb } from 'lucide-react';
import { pidTutorial, type TutorialStep } from '@/code';
import { UNLOCK_BALANCE_S, samplePidCode, type SampleNames } from '../samples';

export interface TutorialPanelProps {
  names: SampleNames;
  balanceBestS: number;
  onUseCode: (code: string) => void;
  className?: string;
}

function steps(names: SampleNames): TutorialStep[] {
  // Bước "bù tốc độ bánh đà" gốc dùng dấu/hệ số chưa khớp xe mô phỏng → thay bằng mẫu hoàn chỉnh của trang
  const base = pidTutorial(names.flywheel).filter((s) => s.id !== 'wheel_speed');
  base.push({
    id: 'wheel_speed',
    title: 'Bước 5 — Mẫu hoàn chỉnh: PID + xả tốc độ bánh đà',
    goal: `Giữ thăng bằng ≥ ${UNLOCK_BALANCE_S} giây trên sàn có đẩy để mở khoá Sa hình.`,
    formula: 'u = Kp·e + Ki·∫e dt − Kd·gyroX + Kw·tốc độ bánh đà',
    body: [
      'Bánh đà chỉ tạo được mô-men khi TĂNG hoặc GIẢM tốc. Giữ thăng bằng lâu, bánh đà quay nhanh dần tới tốc độ tối đa (bão hoà) và xe đổ.',
      'Encoder gắn trên động cơ bánh đà cho biết tốc độ quay (vòng/giây). Cộng thêm Kw × tốc độ vào lệnh: bánh đà được kéo dần về 0 trong khi xe vẫn đứng.',
      'Với xe mô phỏng, hệ số rất nhỏ: Kp ≈ 0,4 (theo độ), Kd ≈ 0,035 (theo độ/giây), Kw ≈ 0,07. D lấy thẳng từ con quay gyroX nên ít nhiễu hơn đạo hàm góc.',
      'Bấm "Dùng code này", rồi Chạy. Bấm Đẩy trái/phải để thử độ bền; chỉnh thanh trượt khi đang chạy.',
    ],
    code: samplePidCode(names),
    sliders: [],
    plots: ['goc'],
    hints: [
      names.encoder ? `Encoder của bạn tên "${names.encoder}".` : 'Xe chưa có encoder gắn vào động cơ bánh đà — quay lại Lắp ráp và thêm "encoder_hall".',
      'Xe lắc mạnh qua lại → giảm Kp hoặc tăng Kd. Xe đổ chậm sau vài giây → tăng Kw.',
    ],
    check: { type: 'balance_seconds', seconds: UNLOCK_BALANCE_S, disturbances: true },
  });
  return base;
}

export function TutorialPanel({ names, balanceBestS, onUseCode, className = '' }: TutorialPanelProps) {
  const all = useMemo(() => steps(names), [names]);
  const [open, setOpen] = useState<string>('read_angle');
  return (
    <div className={`overflow-y-auto bg-white ${className}`}>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">Hướng dẫn cân bằng bằng bánh đà</h2>
        <p className="text-xs text-ink-soft">
          Đọc góc → P → PD → PID → bù bánh đà. Mỗi bước có code mẫu; thanh trượt bên phải chỉnh Kp/Ki/Kd/Kw.
        </p>
      </div>
      <ol>
        {all.map((s, i) => {
          const isOpen = open === s.id;
          const done = s.check ? balanceBestS >= s.check.seconds : false;
          return (
            <li key={s.id} className="border-b border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? '' : s.id)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="flex-1 text-sm font-semibold text-ink">{s.title}</span>
                {s.check &&
                  (done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Đã đạt" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300" aria-label="Chưa đạt" />
                  ))}
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-ink">
                  <p className="font-medium text-brand-dark">🎯 {s.goal}</p>
                  {s.formula && <p className="rounded bg-surface-2 px-2 py-1 font-mono text-xs">{s.formula}</p>}
                  {s.body.map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                  <pre className="max-h-56 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] leading-snug text-slate-100">{s.code}</pre>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUseCode(s.code)}
                      className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      Dùng code này
                    </button>
                    {s.check && (
                      <span className={`text-xs ${done ? 'text-emerald-700' : 'text-ink-soft'}`}>
                        Tiêu chí: giữ thăng bằng {s.check.seconds} s{s.check.disturbances ? ' khi có đẩy' : ''} — tốt nhất{' '}
                        {balanceBestS.toFixed(1)} s
                      </span>
                    )}
                  </div>
                  {s.hints.map((h, j) => (
                    <p key={j} className="flex gap-1.5 text-xs text-ink-soft">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {h}
                    </p>
                  ))}
                  {i < all.length - 1 && (
                    <button type="button" onClick={() => setOpen(all[i + 1].id)} className="text-xs font-medium text-brand hover:underline">
                      Bước tiếp theo →
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
