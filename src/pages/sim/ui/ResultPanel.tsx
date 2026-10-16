// Số liệu trực tiếp, kết quả lượt chạy và log print() của code.
import { CHECKPOINT_NAMES, MAP_NAMES } from '@/sim';
import type { ControllerLog, RunEndReason } from '@/shared/types';
import type { FinishedRun, LiveStats, RunInfo, RunStatus } from '../useSimRun';

const REASON: Record<RunEndReason, { text: string; cls: string }> = {
  completed: { text: 'Hoàn thành', cls: 'bg-emerald-100 text-emerald-800' },
  fell: { text: 'Xe bị đổ', cls: 'bg-red-100 text-red-800' },
  timeout: { text: 'Hết giờ', cls: 'bg-amber-100 text-amber-800' },
  out_of_bounds: { text: 'Ra khỏi sa hình', cls: 'bg-red-100 text-red-800' },
  code_error: { text: 'Lỗi code', cls: 'bg-red-100 text-red-800' },
  stopped: { text: 'Đã dừng', cls: 'bg-slate-100 text-slate-700' },
};

const cpName = (id: string) => (CHECKPOINT_NAMES as Record<string, string>)[id] ?? id;

export function ResultPanel({
  status, info, live, finished, logs, className = '',
}: { status: RunStatus; info: RunInfo | null; live: LiveStats | null; finished: FinishedRun | null; logs: ControllerLog[]; className?: string }) {
  const r = finished?.result;
  return (
    <div className={`flex min-h-0 flex-col gap-2 overflow-y-auto text-xs ${className}`}>
      {info && (
        <div className="text-ink-soft">
          {info.kind === 'remote' ? `Đang xem lượt thi của ${info.by}` : info.kind === 'compete' ? 'Lượt thi' : 'Luyện tập'} ·{' '}
          <b className="text-ink">{MAP_NAMES[info.mapId]}</b>
        </div>
      )}
      {live && (status !== 'idle' || !r) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span>Thời gian</span><b className="text-right font-mono">{live.t.toFixed(1)} s</b>
          <span>Góc nghiêng</span><b className="text-right font-mono">{live.rollDeg.toFixed(1)}°</b>
          <span>Tốc độ</span><b className="text-right font-mono">{live.speed.toFixed(2)} m/s</b>
          <span>Giữ thăng bằng</span><b className="text-right font-mono">{live.streakS.toFixed(1)} s</b>
          <span>Checkpoint</span><b className="text-right">{live.checkpoints.length}</b>
        </div>
      )}
      {r && status === 'idle' && (
        <div className="space-y-1 rounded-md border border-line p-2">
          <div className="flex items-center justify-between">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${REASON[r.reason].cls}`}>{REASON[r.reason].text}</span>
            <span className="text-sm font-bold text-ink">{r.score} điểm</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span>Thời gian</span><b className="text-right font-mono">{r.timeS.toFixed(2)} s</b>
            <span>Giữ thăng bằng dài nhất</span><b className="text-right font-mono">{r.balancedS.toFixed(1)} s</b>
            <span>Nghiêng tối đa</span><b className="text-right font-mono">{r.maxRollDeg.toFixed(1)}°</b>
          </div>
          {r.checkpoints.length > 0 && <div className="text-ink-soft">Đã qua: {r.checkpoints.map(cpName).join(' → ')}</div>}
          {r.errorMessage && <div className="whitespace-pre-wrap rounded bg-red-50 p-1.5 font-mono text-red-700">{r.errorMessage}</div>}
          {finished?.save && (
            <div
              className={
                finished.save.state === 'saved' ? 'text-emerald-700' : finished.save.state === 'error' ? 'text-red-700' : 'text-ink-soft'
              }
            >
              {finished.save.state === 'saving' && 'Đang lưu kết quả vào lịch sử đội…'}
              {finished.save.state === 'saved' && '✓ Đã lưu vào lịch sử đội'}
              {finished.save.state === 'error' && `Chưa lưu được: ${finished.save.message}`}
              {finished.save.state === 'local' && finished.save.message}
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div className="min-h-0">
          <div className="mb-0.5 font-semibold text-ink-soft">Bảng log</div>
          <div className="max-h-28 overflow-y-auto rounded bg-slate-900 p-1.5 font-mono text-[11px] text-slate-100">
            {logs.slice(-50).map((l, i) => (
              <div key={i} className={l.level === 'error' ? 'text-red-300' : ''}>
                <span className="text-slate-500">{l.t.toFixed(2)} </span>
                {l.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
