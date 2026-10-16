// Sơ đồ sa hình nhìn từ trên xuống, vẽ theo PLAN.md mục 3. Đơn vị SVG = 1 cm.
// Khung 400 × 250 cm, lòng đường 50 cm. Làn dưới: xuất phát (đi sang phải) → cua chữ U (bán kính tâm 60 cm)
// → làn trên đi sang trái: cầu bập bênh 1,0 m → bãi đá 0,8 m → đích 0,8 m.
// Khi spec chính thức (src/sim/maps/spec.ts) xong, nên lấy số đo từ đó thay vì hằng số dưới đây.

const W = 400;
const H = 250;
const ROAD = 50;
const R = 60; // bán kính tâm đường của cua U
const CX = 310; // tâm cua U
const CY = 125;
const BOT = CY + R; // tâm làn dưới
const TOP = CY - R; // tâm làn trên
const START_X = 190; // đầu đoạn xuất phát (dài 1,2 m tới x = 310)
const SEESAW_END = 210; // cầu bập bênh từ 310 → 210
const ROCKS_END = 130; // bãi đá từ 210 → 130
const FINISH_X = 50; // đích từ 130 → 50

const SECTIONS = [
  { n: 1, name: 'Xuất phát', detail: 'Đoạn thẳng 1,2 m, ô xuất phát có vạch' },
  { n: 2, name: 'Cua chữ U', detail: 'Bán kính tâm đường 60 cm, quay đầu 180°' },
  { n: 3, name: 'Cầu bập bênh', detail: 'Dài 1,0 m, rộng 25 cm, nghiêng ±10°, cao 8 cm, không có vách' },
  { n: 4, name: 'Bãi đá', detail: 'Dài 80 cm, sỏi dán cố định cao 0,5–1,5 cm' },
  { n: 5, name: 'Đích', detail: 'Đoạn thẳng 0,8 m, vạch đích' },
];

// Đá giả lập — giả ngẫu nhiên theo chỉ số để hình không đổi mỗi lần render
const rand = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};
const ROCKS = Array.from({ length: 38 }, (_, i) => ({
  x: ROCKS_END + 4 + rand(i + 1) * 72,
  y: TOP - 21 + rand(i + 101) * 42,
  r: 1.3 + rand(i + 201) * 2.2,
}));

function Checkpoint({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <line x1={x} y1={y - ROAD / 2} x2={x} y2={y + ROAD / 2} stroke="#16a34a" strokeWidth="1.6" strokeDasharray="3 2" />
      <circle cx={x} cy={y - ROAD / 2 - 7} r="5.5" fill="#16a34a" />
      <text x={x} y={y - ROAD / 2 - 5} textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
        {n}
      </text>
    </g>
  );
}

export default function CourseMap({ showLegend = true }: { showLegend?: boolean }) {
  const wall = { fill: 'none', stroke: '#ffffff', strokeWidth: 3.5, strokeLinecap: 'round' as const };
  const wallShadow = { ...wall, stroke: '#64748b', strokeWidth: 5.5 };
  const walls = [
    // Làn dưới (xuất phát)
    `M${START_X} ${BOT + ROAD / 2} H${CX}`,
    `M${START_X} ${BOT - ROAD / 2} H${CX}`,
    `M${START_X} ${BOT - ROAD / 2} V${BOT + ROAD / 2}`, // vách chặn phía sau ô xuất phát
    // Cua U: vách ngoài (r = 85) và vách trong (r = 35)
    `M${CX} ${BOT + ROAD / 2} A${R + ROAD / 2} ${R + ROAD / 2} 0 0 0 ${CX} ${TOP - ROAD / 2}`,
    `M${CX} ${BOT - ROAD / 2} A${R - ROAD / 2} ${R - ROAD / 2} 0 0 0 ${CX} ${TOP + ROAD / 2}`,
    // Làn trên: bãi đá + đích (cầu bập bênh không có vách)
    `M${SEESAW_END} ${TOP - ROAD / 2} H${FINISH_X}`,
    `M${SEESAW_END} ${TOP + ROAD / 2} H${FINISH_X}`,
  ];

  return (
    <figure className="w-full">
      <svg
        viewBox={`-22 -14 ${W + 34} ${H + 46}`}
        className="h-auto w-full"
        role="img"
        aria-label="Sơ đồ sa hình 4,0 × 2,5 m: xuất phát, cua chữ U, cầu bập bênh, bãi đá, đích"
      >
        <defs>
          <pattern id="cm-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          </pattern>
          <pattern id="cm-finish" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#fff" />
            <rect width="3" height="3" fill="#0f172a" />
            <rect x="3" y="3" width="3" height="3" fill="#0f172a" />
          </pattern>
          <marker id="cm-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#f97316" />
          </marker>
        </defs>

        {/* Nền sa hình 4,0 × 2,5 m */}
        <rect x="0" y="0" width={W} height={H} rx="4" fill="#e2e8f0" />
        <rect x="0" y="0" width={W} height={H} rx="4" fill="url(#cm-grid)" />

        {/* Lòng đường (nền xám đậm hơn) */}
        <path
          d={`M${START_X} ${BOT} H${CX} A${R} ${R} 0 0 0 ${CX} ${TOP} H${FINISH_X}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={ROAD}
        />

        {/* Vùng cầu bập bênh: hai bên là khoảng trống (rơi khỏi cầu) */}
        <rect x={SEESAW_END} y={TOP - ROAD / 2} width={CX - SEESAW_END} height={ROAD} fill="#475569" />
        <rect x={SEESAW_END} y={TOP - 12.5} width={CX - SEESAW_END} height="25" rx="1.5" fill="#d6a467" stroke="#92400e" strokeWidth="0.8" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={SEESAW_END + 10 + i * 10} y1={TOP - 12.5} x2={SEESAW_END + 10 + i * 10} y2={TOP + 12.5} stroke="#b07a3c" strokeWidth="0.6" />
        ))}
        {/* Trục xoay giữa cầu */}
        <line x1={(CX + SEESAW_END) / 2} y1={TOP - 16} x2={(CX + SEESAW_END) / 2} y2={TOP + 16} stroke="#0f172a" strokeWidth="1.5" />
        <circle cx={(CX + SEESAW_END) / 2} cy={TOP} r="2.5" fill="#0f172a" />

        {/* Bãi đá */}
        <rect x={ROCKS_END} y={TOP - ROAD / 2} width={SEESAW_END - ROCKS_END} height={ROAD} fill="#a8a29e" />
        {ROCKS.map((r, i) => (
          <circle key={i} cx={r.x} cy={r.y} r={r.r} fill="#57534e" />
        ))}

        {/* Ô xuất phát và vạch đích */}
        <rect x={START_X + 4} y={BOT - 18} width="40" height="36" fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="4 2" />
        <text x={START_X + 24} y={BOT + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">START</text>
        <rect x={FINISH_X} y={TOP - ROAD / 2} width="6" height={ROAD} fill="url(#cm-finish)" />

        {/* Vách (trắng, viền xám) */}
        {walls.map((d, i) => (
          <path key={`s${i}`} d={d} {...wallShadow} />
        ))}
        {walls.map((d, i) => (
          <path key={`w${i}`} d={d} {...wall} />
        ))}

        {/* Hướng chạy */}
        <path
          d={`M${START_X + 50} ${BOT} H${CX} A${R} ${R} 0 0 0 ${CX} ${TOP} H${FINISH_X + 14}`}
          fill="none"
          stroke="#f97316"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerEnd="url(#cm-arrow)"
          opacity="0.9"
        />

        {/* Checkpoint cuối mỗi đoạn */}
        <Checkpoint x={CX} y={BOT} n={1} />
        <Checkpoint x={CX - 1} y={TOP} n={2} />
        <Checkpoint x={SEESAW_END} y={TOP} n={3} />
        <Checkpoint x={ROCKS_END} y={TOP} n={4} />
        <Checkpoint x={FINISH_X + 6} y={TOP} n={5} />

        {/* Nhãn đoạn đường */}
        <g fontSize="8.5" fontWeight="600" fill="#0f172a">
          <text x={(START_X + CX) / 2} y={BOT + ROAD / 2 + 12} textAnchor="middle">① Xuất phát · 1,2 m</text>
          <text x={CX + R + ROAD / 2 - 4} y={CY + 3} textAnchor="end">② Cua U · R60</text>
          <text x={(CX + SEESAW_END) / 2} y={TOP + ROAD / 2 + 12} textAnchor="middle">③ Cầu bập bênh · 1,0 m</text>
          <text x={(SEESAW_END + ROCKS_END) / 2} y={TOP + ROAD / 2 + 12} textAnchor="middle">④ Bãi đá · 0,8 m</text>
          <text x={(ROCKS_END + FINISH_X) / 2} y={TOP + ROAD / 2 + 12} textAnchor="middle">⑤ Đích · 0,8 m</text>
        </g>

        {/* Kích thước tổng */}
        <g stroke="#475569" strokeWidth="0.7" fill="#475569" fontSize="8">
          <line x1="0" y1={H + 20} x2={W} y2={H + 20} />
          <line x1="0" y1={H + 16} x2="0" y2={H + 24} />
          <line x1={W} y1={H + 16} x2={W} y2={H + 24} />
          <text x={W / 2} y={H + 29} textAnchor="middle" stroke="none">4,0 m</text>
          <line x1={-6} y1="0" x2={-6} y2={H} />
          <text x={-10} y={H / 2} textAnchor="middle" stroke="none" transform={`rotate(-90 -10 ${H / 2})`}>
            2,5 m
          </text>
          <text x={FINISH_X - 8} y={BOT} textAnchor="start" stroke="none" fontSize="7" fill="#64748b">
            Lòng đường 50 cm · vách cao 15 cm
          </text>
        </g>
      </svg>

      {showLegend && (
        <figcaption className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <div key={s.n} className="flex gap-3 rounded-lg border border-line bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {s.n}
              </span>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-ink-soft">{s.detail}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-3 rounded-lg border border-line bg-white p-3">
            <span className="mt-1 h-0 w-6 shrink-0 border-t-2 border-dashed border-green-600" />
            <div className="text-ink-soft">
              <span className="font-semibold text-ink">Checkpoint</span> ở cuối mỗi đoạn, dùng để chấm điểm và theo dõi
              tiến độ.
            </div>
          </div>
        </figcaption>
      )}
    </figure>
  );
}
