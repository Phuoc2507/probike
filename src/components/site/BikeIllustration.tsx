// Hình minh hoạ xe máy tự cân bằng (nhìn ngang): 2 bánh thẳng hàng, bánh đà quay ở giữa thân.
// Dùng SVG + CSS animation thay vì 3D để trang chủ tải nhanh.

export default function BikeIllustration({ className = '' }: { className?: string }) {
  const spin = { transformBox: 'fill-box' as const, transformOrigin: 'center' };
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="Minh hoạ xe máy tự cân bằng bằng bánh đà">
      <style>{`
        @keyframes pb-spin { to { transform: rotate(360deg); } }
        @keyframes pb-sway { 0%,100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
        .pb-wheel { animation: pb-spin 2.4s linear infinite; }
        .pb-fly { animation: pb-spin 0.6s linear infinite; }
        .pb-body { animation: pb-sway 3.2s ease-in-out infinite; transform-origin: 210px 262px; }
        @media (prefers-reduced-motion: reduce) { .pb-wheel, .pb-fly, .pb-body { animation: none; } }
      `}</style>

      {/* Mặt đường */}
      <rect x="10" y="262" width="400" height="6" rx="3" fill="#334155" />
      <ellipse cx="210" cy="266" rx="170" ry="7" fill="#000" opacity="0.25" />

      <g className="pb-body">
        {/* Khung */}
        <path d="M110 222 L170 140 L270 140 L310 222" fill="none" stroke="#f97316" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M170 140 L210 222 L270 140" fill="none" stroke="#c2410c" strokeWidth="6" strokeLinejoin="round" />
        {/* Càng trước + tay lái */}
        <path d="M310 222 L285 110 L310 96" fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {/* Mạch điều khiển + pin */}
        <rect x="178" y="104" width="78" height="30" rx="5" fill="#0ea5e9" />
        <rect x="186" y="111" width="22" height="16" rx="2" fill="#0f172a" />
        <circle cx="240" cy="119" r="4" fill="#22c55e" />
        <rect x="140" y="118" width="34" height="20" rx="4" fill="#475569" />
        {/* Cảm biến khoảng cách phía trước */}
        <rect x="300" y="150" width="20" height="12" rx="2" fill="#1e293b" />
        <circle cx="314" cy="156" r="3" fill="#ef4444" />

        {/* Bánh đà (reaction wheel) */}
        <circle cx="222" cy="182" r="34" fill="#1e293b" stroke="#cbd5e1" strokeWidth="3" />
        <g className="pb-fly" style={spin}>
          <circle cx="222" cy="182" r="28" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="10 6" />
          <path d="M222 156 V208 M196 182 H248" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="222" cy="182" r="5" fill="#f97316" />

        {/* Bánh sau và bánh trước (bánh BTC) */}
        {[110, 310].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="222" r="40" fill="#0f172a" />
            <circle cx={cx} cy="222" r="27" fill="#334155" />
            <g className="pb-wheel" style={spin}>
              <circle cx={cx} cy="222" r="27" fill="none" />
              <path
                d={`M${cx} 197 V247 M${cx - 25} 222 H${cx + 25} M${cx - 18} 204 L${cx + 18} 240 M${cx + 18} 204 L${cx - 18} 240`}
                stroke="#94a3b8"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
            <circle cx={cx} cy="222" r="6" fill="#f97316" />
          </g>
        ))}
      </g>

      {/* Mũi tên minh hoạ mô-men chống đổ */}
      <g fill="none" stroke="#fdba74" strokeWidth="2.5" strokeLinecap="round" opacity="0.85">
        <path d="M168 58 A60 22 0 0 1 276 58" />
        <path d="M268 50 L277 58 L266 63" />
      </g>
      <text x="222" y="40" textAnchor="middle" fill="#fed7aa" fontSize="13" fontWeight="600">
        Bánh đà giữ thăng bằng
      </text>
    </svg>
  );
}
