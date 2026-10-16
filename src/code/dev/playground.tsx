// Trang thử nghiệm (chỉ dùng khi dev): http://localhost:5173/src/code/dev/index.html
// Không nằm trong bản build. Dùng để kiểm tra Blockly, CodeEditor, Worker runtime, xuất Arduino trên trình duyệt thật.
// Xe giả lập ở đây là con lắc ngược đơn giản — KHÔNG phải SimEngine thật.

import { StrictMode, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import {
  ArduinoCodeView, BlocklyEditor, CodeEditor, blocksJsonToJs, createControllerRuntime, samplePidBlocks, samplePidJs,
  type CodeError,
} from '@/code';
import type { SensorFrame } from '@/shared/types';

const PARTS = ['banhDa', 'dongCoSau', 'lai', 'laserTruoc'];

function Playground() {
  const [mode, setMode] = useState<'blocks' | 'code' | 'arduino'>('blocks');
  const [blocks, setBlocks] = useState<object | null>(() => samplePidBlocks());
  const [code, setCode] = useState(() => samplePidJs());
  const [error, setError] = useState<CodeError | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [changes, setChanges] = useState(0);
  const runningRef = useRef(false);

  const jsFromBlocks = useMemo(() => blocksJsonToJs(blocks), [blocks]);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    const src = mode === 'code' ? code : jsFromBlocks;
    const rt = createControllerRuntime({ mode: 'worker', actuators: PARTS });
    const out: string[] = [];
    const res = await rt.load(src);
    if (!res.ok) {
      const m = res.error.match(/^Dòng (\d+):/);
      setError({ message: res.error, line: m ? Number(m[1]) : undefined });
      runningRef.current = false;
      return;
    }
    // Con lắc ngược: góc θ (độ), bánh đà tạo gia tốc ngược chiều lệnh
    let theta = 3;
    let omega = 0;
    const h = 0.01;
    const t0 = performance.now();
    try {
      for (let i = 0; i < 300; i++) {
        const frame: SensorFrame = {
          t: i * h, values: { laserTruoc: 50 },
          imu: { roll: theta, pitch: 0, yaw: 0, gyro: [omega, 0, 0], acc: [0, 9.8, 0] },
        };
        const cmd = await rt.tick(frame);
        const u = cmd.banhDa ?? 0;
        omega += (30 * Math.sin((theta * Math.PI) / 180) * 57.3 + 4000 * u) * h;
        theta += omega * h;
        if (Math.abs(theta) > 45) { out.push(`Đổ ở t=${(i * h).toFixed(2)} s`); break; }
      }
      out.push(`Góc cuối: ${theta.toFixed(3)}°, 300 tick trong ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (e) {
      const err = e as Error & { line?: number };
      setError({ message: err.message, line: err.line });
    }
    out.unshift(...rt.drainLogs().map((l) => `[${l.level}] ${l.text}`));
    out.push(`${rt.drainPlots().length} điểm plot`);
    rt.dispose();
    setLog(out);
    runningRef.current = false;
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        {(['blocks', 'code', 'arduino'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? 'bg-brand text-white' : 'bg-surface-2 text-ink'}`}>
            {m === 'blocks' ? 'Khối' : m === 'code' ? 'Code JS' : 'Arduino C++'}
          </button>
        ))}
        <button type="button" onClick={run} className="ml-auto rounded-md bg-ink px-3 py-1.5 text-sm text-white">Chạy thử (Worker)</button>
        <button type="button" onClick={() => setBlocks(samplePidBlocks('banhDa', { Kp: 5, Ki: 0, Kd: 0.5 }))}
          className="rounded-md border border-line px-3 py-1.5 text-sm">Giả lập đồng đội sửa khối</button>
        <span className="text-xs text-ink-soft" data-testid="changes">onChange: {changes}</span>
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'blocks' && (
          <BlocklyEditor partNames={PARTS} value={blocks} onReady={(ws) => { (window as unknown as { __ws: unknown }).__ws = ws; }} onChange={(json) => { setBlocks(json); setChanges((c) => c + 1); }} />
        )}
        {mode === 'code' && <CodeEditor value={code} onChange={setCode} partNames={PARTS} error={error} className="h-full" />}
        {mode === 'arduino' && <ArduinoCodeView blocks={blocks} className="h-full" />}
      </div>
      <pre className="max-h-40 overflow-auto rounded bg-surface-2 p-2 text-xs" data-testid="log">
        {error ? `LỖI: ${error.message}\n` : ''}{log.join('\n')}
      </pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Playground /></StrictMode>);
