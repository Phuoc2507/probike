// Biểu đồ góc nghiêng (và các giá trị plot() của code) theo thời gian — Recharts, cập nhật ~8 lần/giây
// từ bộ đệm do vòng lặp mô phỏng ghi vào (không render theo từng bước mô phỏng).
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ChartRow = { t: number } & Record<string, number>;

/** Bộ đệm gom mẫu theo ô thời gian 50 ms, giữ cửa sổ `windowS` giây gần nhất. */
export class TelemetryBuffer {
  rows: ChartRow[] = [];
  keys = new Set<string>();
  version = 0;
  constructor(public windowS = 12, public binS = 0.05) {}

  push(t: number, key: string, value: number) {
    if (!Number.isFinite(value)) return;
    const bt = Math.round(t / this.binS) * this.binS;
    let row = this.rows[this.rows.length - 1];
    if (!row || bt > row.t + 1e-9) {
      row = { t: Math.round(bt * 1000) / 1000 } as ChartRow;
      this.rows.push(row);
      const cut = bt - this.windowS;
      let i = 0;
      while (i < this.rows.length && this.rows[i].t < cut) i++;
      if (i) this.rows.splice(0, i);
    } else if (bt < row.t - 1e-9) {
      // mẫu trễ (plot của code về sau snapshot) — tìm ô cũ
      const r = this.rows.find((x) => Math.abs(x.t - bt) < 1e-6);
      if (!r) return;
      row = r;
    }
    row[key] = Math.round(value * 1000) / 1000;
    this.keys.add(key);
    this.version++;
  }

  clear() {
    this.rows = [];
    this.keys.clear();
    this.version++;
  }
}

const COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#64748b'];
export const ROLL_KEY = 'gócNghiêng';

export function TelemetryChart({ buffer, className = '' }: { buffer: TelemetryBuffer; className?: string }) {
  const [data, setData] = useState<{ rows: ChartRow[]; keys: string[] }>({ rows: [], keys: [] });
  useEffect(() => {
    let seen = -1;
    const id = setInterval(() => {
      if (buffer.version === seen) return;
      seen = buffer.version;
      // góc nghiêng thật luôn đứng đầu, tối đa 4 đường plot() của code
      const keys = [ROLL_KEY, ...[...buffer.keys].filter((k) => k !== ROLL_KEY).slice(0, 4)].filter((k) => buffer.keys.has(k));
      // Sao chép từng dòng: Recharts (immer) đóng băng dữ liệu được truyền vào, bộ đệm vẫn cần ghi tiếp
      setData({ rows: buffer.rows.map((r) => ({ ...r })), keys });
    }, 125);
    return () => clearInterval(id);
  }, [buffer]);

  return (
    <div className={`min-h-0 ${className}`}>
      {data.rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-ink-soft">
          Bấm <b className="mx-1">Chạy</b> để xem biểu đồ góc nghiêng theo thời gian.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => `${v.toFixed(0)}s`} fontSize={11} />
            <YAxis fontSize={11} domain={['auto', 'auto']} allowDataOverflow={false} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Tooltip
              formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {data.keys.map((k, i) => (
              <Line
                key={k}
                dataKey={k}
                name={k === ROLL_KEY ? 'góc nghiêng (°)' : k}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={k === ROLL_KEY ? 2 : 1.25}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
