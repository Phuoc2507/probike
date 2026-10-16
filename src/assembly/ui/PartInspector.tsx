// Bảng chỉnh linh kiện đang chọn: đổi tên (kiểm tra trùng), chân cắm, gắn vào, vị trí/góc xoay, xoá.
import { useEffect, useState } from 'react';
import { Copy, Trash } from 'lucide-react';
import type { CatalogItem, PlacedPart, Vec3, VehicleDesign } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { attachCandidates, controllerPins, needsPin, SHARED_PINS, snap, validatePartName } from '../design';
import { fmtVnd } from '../rules';
import { CATEGORY_LABEL } from './PartPalette';

export interface PartInspectorProps {
  design: VehicleDesign;
  part: PlacedPart;
  locked: boolean;
  disabled?: boolean;
  onRename: (name: string) => void;
  onPatch: (patch: Partial<Pick<PlacedPart, 'pin' | 'attachTo'>>) => void;
  onPose: (pose: { position?: Vec3; rotationDeg?: Vec3 }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const SENSOR_LABEL: Record<string, string> = {
  imu: 'Góc nghiêng, con quay, gia tốc',
  encoder: 'Tốc độ quay (vòng/giây)',
  ultrasonic: 'Khoảng cách bằng sóng âm (chùm nón)',
  tof_laser: 'Khoảng cách bằng laser (tia hẹp)',
  ir_distance: 'Khoảng cách hồng ngoại (analog)',
  ir_reflect: 'Phát hiện vạch / nền (0 hoặc 1)',
  lidar_360: 'Quét khoảng cách 360°',
};

export function PartInspector({ design, part, locked, disabled, onRename, onPatch, onPose, onDuplicate, onDelete }: PartInspectorProps) {
  const item = CATALOG_BY_ID[part.itemId];
  const [draft, setDraft] = useState(part.name);
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(part.name);
    setNameError(null);
  }, [part.uid, part.name]);

  if (!item) return <p className="text-sm text-red-700">Linh kiện không có trong kho.</p>;

  const commitName = () => {
    if (draft === part.name) return setNameError(null);
    const err = validatePartName(design, part.uid, draft);
    setNameError(err);
    if (!err) onRename(draft.trim());
  };

  const controller = design.parts.find((p) => CATALOG_BY_ID[p.itemId]?.category === 'controller');
  const pins = controllerPins(controller?.itemId);
  const pinOwner = (pin: string) =>
    SHARED_PINS.has(pin) ? undefined : design.parts.find((p) => p.uid !== part.uid && p.pin === pin)?.name;
  const candidates = attachCandidates(design, part);
  const s = item.sensor;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{CATEGORY_LABEL[item.category]}</div>
        <div className="font-semibold text-ink">{item.name}</div>
        <div className="text-xs text-ink-soft">
          {item.providedByBtc ? 'BTC phát' : fmtVnd(item.priceVnd)} · {Math.round(item.massKg * 1000)} g
        </div>
        <p className="mt-1 text-xs text-ink-soft">{item.description}</p>
        {s && (
          <p className="mt-1 text-xs text-ink-soft">
            Đo: {SENSOR_LABEL[s.kind]}
            {s.maxRange ? ` · tầm ${s.minRange ?? 0}–${s.maxRange} m` : ''} · {s.rateHz} Hz
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Tên dùng trong chương trình</span>
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); setNameError(validatePartName(design, part.uid, e.target.value)); }}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(part.name); }}
          className={`w-full rounded-md border bg-surface px-2 py-1.5 font-mono outline-none ${
            nameError ? 'border-red-400' : 'border-line focus:border-brand'
          }`}
        />
        {nameError ? (
          <span className="mt-1 block text-xs text-red-700">{nameError}</span>
        ) : (
          <code className="mt-1 block text-xs text-ink-soft">{usageHint(item, part.name)}</code>
        )}
      </label>

      {needsPin(item) && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Chân cắm trên vi điều khiển</span>
          {pins.length === 0 ? (
            <span className="text-xs text-ink-soft">Gắn vi điều khiển trước để chọn chân.</span>
          ) : (
            <select
              value={part.pin ?? ''}
              disabled={disabled}
              onChange={(e) => onPatch({ pin: e.target.value || undefined })}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-brand"
            >
              <option value="">— chưa chọn —</option>
              {part.pin && !pins.includes(part.pin) && <option value={part.pin}>{part.pin} (không có trên mạch này)</option>}
              {pins.map((pin) => {
                const owner = pinOwner(pin);
                return (
                  <option key={pin} value={pin}>
                    {pin === 'I2C' ? 'I2C (bus dùng chung SDA/SCL)' : pin}
                    {owner ? ` — đang dùng: ${owner}` : ''}
                  </option>
                );
              })}
            </select>
          )}
        </label>
      )}

      {candidates.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Gắn vào</span>
          <select
            value={part.attachTo ?? ''}
            disabled={disabled}
            onChange={(e) => onPatch({ attachTo: e.target.value || undefined })}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-brand"
          >
            <option value="">— không gắn —</option>
            {candidates.map((c) => (
              <option key={c.uid} value={c.uid}>{c.name} ({CATALOG_BY_ID[c.itemId]?.name})</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-soft">Linh kiện gắn vào sẽ di chuyển theo linh kiện cha.</span>
        </label>
      )}

      <fieldset disabled={disabled || locked} className="space-y-1">
        <legend className="mb-1 text-xs font-medium text-ink-soft">
          Vị trí (cm) — x trước, y lên, z ngang {locked && '· bánh xe tự đặt theo khung'}
        </legend>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <NumberField
              key={i}
              label={'xyz'[i]}
              value={part.position[i] * 100}
              step={0.5}
              onCommit={(v) => {
                const p = [...part.position] as Vec3;
                p[i] = snap(v / 100); // bắt lưới 5 mm như gizmo
                onPose({ position: p });
              }}
            />
          ))}
        </div>
        <div className="mb-1 mt-2 text-xs font-medium text-ink-soft">Góc xoay (độ)</div>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <NumberField
              key={i}
              label={'xyz'[i]}
              value={part.rotationDeg[i]}
              step={15}
              onCommit={(v) => {
                const r = [...part.rotationDeg] as Vec3;
                r[i] = ((((v + 180) % 360) + 360) % 360) - 180;
                onPose({ rotationDeg: r });
              }}
            />
          ))}
        </div>
      </fieldset>

      {!locked && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onDuplicate}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line px-2 py-1.5 hover:border-brand disabled:opacity-50"
          >
            <Copy className="h-4 w-4" /> Nhân bản
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash className="h-4 w-4" /> Xoá
          </button>
        </div>
      )}
    </div>
  );
}

function usageHint(item: CatalogItem, name: string): string {
  const category = item.category;
  const sensorKind = item.sensor?.kind;
  if (sensorKind === 'imu') return 'Trong code: imu.roll(), imu.gyroX()…';
  if (sensorKind === 'encoder') return `Trong code: encoder("${name}")`;
  if (category === 'sensor') return `Trong code: read("${name}")`;
  if (category === 'motor') return item.motor?.kind === 'servo' ? `Trong code: servo("${name}", độ)` : `Trong code: motor("${name}", -1..1)`;
  return 'Đặt tên dễ nhớ, không dấu, ví dụ: pinChinh';
}

function NumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (v: number) => void }) {
  const shown = Math.round(value * 100) / 100;
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);
  const commit = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v) && v !== shown) onCommit(v);
    else setDraft(String(shown));
  };
  return (
    <label className="flex items-center gap-1 rounded-md border border-line bg-surface px-1.5">
      <span className="text-xs text-ink-soft">{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full min-w-0 bg-transparent py-1 text-right text-sm outline-none"
      />
    </label>
  );
}
