// Thanh trượt tham số (Kp/Ki/Kd/Kw, tốc độ) — giá trị nằm trong workspace nên cả đội cùng thấy,
// đổi khi đang chạy là có tác dụng ngay (runtime.setParams).
import type { TutorialSlider } from '@/code';

export interface ParamSlidersProps {
  sliders: TutorialSlider[];
  values: Record<string, number>;
  onChange: (name: string, value: number) => void;
  onReset?: () => void;
  className?: string;
}

const decimals = (step: number) => Math.max(0, Math.ceil(-Math.log10(step)));

export function ParamSliders({ sliders, values, onChange, onReset, className = '' }: ParamSlidersProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tham số</span>
        {onReset && (
          <button type="button" onClick={onReset} className="text-xs text-ink-soft underline-offset-2 hover:text-brand hover:underline">
            Về mặc định
          </button>
        )}
      </div>
      {sliders.map((s) => {
        const v = values[s.name] ?? s.default;
        return (
          <label key={s.name} className="block">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink">{s.label}</span>
              <input
                type="number"
                value={Number(v.toFixed(decimals(s.step)))}
                step={s.step}
                min={s.min}
                max={s.max}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) onChange(s.name, n);
                }}
                className="w-16 rounded border border-line px-1 py-0 text-right font-mono text-xs"
              />
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={v}
              onChange={(e) => onChange(s.name, Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-[var(--color-brand)]"
            />
          </label>
        );
      })}
    </div>
  );
}
