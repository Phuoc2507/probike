// Bảng thông tin: khối lượng, trọng tâm, chi phí/ngân sách, kích thước, lỗi và cảnh báo.
import { useState } from 'react';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { DesignCheck, VehicleDesign } from '@/shared/types';
import { BUDGET_PER_TEAM_VND, CATALOG_BY_ID } from '@/shared/catalog';
import { FRAME_MATERIAL_LABEL, LIMITS, frameCost } from '../design';
import { designBounds, fmtCm, fmtKg, fmtVnd } from '../rules';

export function DesignInfo({ design, check }: { design: VehicleDesign; check: DesignCheck }) {
  const [showCost, setShowCost] = useState(false);
  const b = designBounds(design);
  const len = b.max[0] - b.min[0];
  const hgt = b.max[1] - Math.min(0, b.min[1]);
  const wid = b.max[2] - b.min[2];
  const com = check.centerOfMass;

  return (
    <div className="space-y-3 text-sm">
      <div
        className={`flex items-center gap-2 rounded-md px-3 py-2 font-semibold ${
          check.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}
      >
        {check.ok ? <CircleCheck className="h-5 w-5" /> : <CircleX className="h-5 w-5" />}
        {check.ok ? 'Xe hợp lệ — sẵn sàng mô phỏng' : `Chưa hợp lệ: ${check.errors.length} lỗi cần sửa`}
      </div>

      <Meter
        label="Khối lượng"
        value={`${fmtKg(check.totalMassKg)} / ${fmtKg(LIMITS.massKg)} kg`}
        ratio={check.totalMassKg / LIMITS.massKg}
        over={check.totalMassKg > LIMITS.massKg}
      />
      <Meter
        label="Chi phí"
        value={`${fmtVnd(check.totalCostVnd)} / ${fmtVnd(BUDGET_PER_TEAM_VND)}`}
        ratio={check.totalCostVnd / BUDGET_PER_TEAM_VND}
        over={check.totalCostVnd > BUDGET_PER_TEAM_VND}
        warnOnly
      />
      <button type="button" onClick={() => setShowCost((v) => !v)} className="text-xs text-brand-dark hover:underline">
        {showCost ? 'Ẩn chi tiết chi phí' : 'Xem chi tiết chi phí'}
      </button>
      {showCost && <CostTable design={design} />}

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <Dim label="Dài" v={len} max={LIMITS.lengthM} />
        <Dim label="Rộng" v={wid} max={LIMITS.widthM} />
        <Dim label="Cao" v={hgt} max={LIMITS.heightM} />
      </div>

      <div className="rounded-md bg-surface-2 px-3 py-2 text-xs">
        <div className="mb-0.5 font-semibold text-ink">Trọng tâm (chấm vàng)</div>
        <div className="text-ink-soft">
          cao {fmtCm(com[1])} cm · lệch trước/sau {fmtCm(com[0])} cm · lệch ngang {fmtCm(com[2])} cm
        </div>
        <div className="mt-0.5 text-ink-soft">Mẹo: trọng tâm thấp và nằm giữa thân xe giúp cân bằng dễ hơn.</div>
      </div>

      {check.errors.length > 0 && (
        <ul className="space-y-1">
          {check.errors.map((e) => (
            <li key={e} className="flex gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      {check.warnings.length > 0 && (
        <ul className="space-y-1">
          {check.warnings.map((w) => (
            <li key={w} className="flex gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Meter({ label, value, ratio, over, warnOnly }: { label: string; value: string; ratio: number; over: boolean; warnOnly?: boolean }) {
  const color = over ? (warnOnly ? 'bg-amber-500' : 'bg-red-500') : ratio > 0.85 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-ink-soft">{label}</span>
        <span className={`font-semibold ${over ? (warnOnly ? 'text-amber-700' : 'text-red-700') : 'text-ink'}`}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

function Dim({ label, v, max }: { label: string; v: number; max: number }) {
  const over = v > max + 5e-4;
  return (
    <div className={`rounded-md px-1 py-1.5 ${over ? 'bg-red-50 text-red-700' : 'bg-surface-2 text-ink'}`}>
      <div className="text-ink-soft">{label}</div>
      <div className="font-semibold">{fmtCm(v)} cm</div>
      <div className="text-[10px] text-ink-soft">tối đa {fmtCm(max)}</div>
    </div>
  );
}

function CostTable({ design }: { design: VehicleDesign }) {
  const rows = new Map<string, { name: string; qty: number; price: number }>();
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) continue;
    const r = rows.get(item.id) ?? { name: item.name, qty: 0, price: item.providedByBtc ? 0 : item.priceVnd };
    r.qty += 1;
    rows.set(item.id, r);
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        <tr className="border-b border-line">
          <td className="py-1">Khung {FRAME_MATERIAL_LABEL[design.frame.material].toLowerCase()}</td>
          <td className="py-1 text-right">1</td>
          <td className="py-1 text-right">{fmtVnd(frameCost(design.frame))}</td>
        </tr>
        {[...rows.values()].map((r) => (
          <tr key={r.name} className="border-b border-line">
            <td className="py-1">{r.name}</td>
            <td className="py-1 text-right">{r.qty}</td>
            <td className="py-1 text-right">{r.price === 0 ? 'BTC phát' : fmtVnd(r.price * r.qty)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
