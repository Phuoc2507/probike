// Trang thử trình lắp ráp (không nằm trong router chính).
// Mở khi chạy `npm run dev`: http://localhost:5173/src/assembly/demo.html
import { useEffect, useState } from 'react';
import type { VehicleDesign } from '@/shared/types';
import { Assembler } from './Assembler';
import { createDefaultDesign } from './presets';

const STORAGE_KEY = 'probike.assembly.demo';

function loadDesign(): VehicleDesign {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VehicleDesign;
  } catch {
    /* bỏ qua dữ liệu hỏng */
  }
  return createDefaultDesign();
}

export default function AssemblerDemo() {
  const [design, setDesign] = useState<VehicleDesign>(loadDesign);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
    } catch {
      /* trình duyệt chặn lưu */
    }
  }, [design]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-ink px-4 py-2 text-white">
        <div className="font-semibold">
          ProBike <span className="text-brand">· Thử trình lắp ráp xe</span>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setShowJson((v) => !v)} className="rounded bg-white/10 px-3 py-1 hover:bg-white/20">
            {showJson ? 'Ẩn JSON' : 'Xem VehicleDesign (JSON)'}
          </button>
          <button
            type="button"
            onClick={() => setDesign(createDefaultDesign())}
            className="rounded bg-brand px-3 py-1 hover:bg-brand-dark"
          >
            Làm lại
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <Assembler design={design} onChange={setDesign} />
        {showJson && (
          <pre className="absolute inset-y-4 left-4 z-10 w-[420px] overflow-auto rounded-lg bg-ink/95 p-3 text-xs text-green-200 shadow-xl">
            {JSON.stringify(design, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
