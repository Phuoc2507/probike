// Chỉnh khung: chiều dài trục bánh, chiều cao, vật liệu, bánh trước lái được.
import type { VehicleDesign, VehicleFrame } from '@/shared/types';
import { FRAME_MATERIAL_LABEL, FRAME_RANGE, frameCost, type FrameMaterial } from '../design';
import { fmtVnd } from '../rules';

export function FramePanel({
  design, onFrame, disabled,
}: {
  design: VehicleDesign;
  onFrame: (patch: Partial<Omit<VehicleFrame, 'massKg'>>) => void;
  disabled?: boolean;
}) {
  const f = design.frame;
  return (
    <div className="space-y-3 px-3 pb-3 text-sm">
      <Slider
        label="Khoảng cách 2 trục bánh"
        valueM={f.wheelbase}
        range={FRAME_RANGE.wheelbase}
        disabled={disabled}
        onChange={(v) => onFrame({ wheelbase: v })}
      />
      <Slider
        label="Chiều cao khung (trên trục bánh)"
        valueM={f.height}
        range={FRAME_RANGE.height}
        disabled={disabled}
        onChange={(v) => onFrame({ height: v })}
      />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Vật liệu khung</span>
        <select
          value={f.material}
          disabled={disabled}
          onChange={(e) => onFrame({ material: e.target.value as FrameMaterial })}
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-brand"
        >
          {(Object.keys(FRAME_MATERIAL_LABEL) as FrameMaterial[]).map((m) => (
            <option key={m} value={m}>{FRAME_MATERIAL_LABEL[m]}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={f.steerable}
          disabled={disabled}
          onChange={(e) => onFrame({ steerable: e.target.checked })}
          className="accent-brand"
        />
        <span>Bánh trước lái được (cần servo)</span>
      </label>
      <p className="text-xs text-ink-soft">
        Khung nặng {Math.round(f.massKg * 1000)} g · giá {fmtVnd(frameCost(f))}. Hai bánh BTC tự đặt đúng trục.
      </p>
    </div>
  );
}

function Slider({
  label, valueM, range, onChange, disabled,
}: {
  label: string;
  valueM: number;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium text-ink-soft">
        <span>{label}</span>
        <span className="font-semibold text-ink">{(valueM * 100).toFixed(1).replace('.', ',')} cm</span>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={valueM}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </label>
  );
}
