// Điều phối lượt chạy của trang mô phỏng:
//  - Chạy (luyện tập): chỉ máy này, không phát cho đội, không lưu.
//  - Thi: phát qua kênh run của workspace (cả đội xem chung), kết quả lưu bằng saveRun (khi có đội).
//  - Xem: đồng đội bấm Thi → máy này dừng lượt luyện tập (nếu có) và vẽ khung hình nhận được.
// Mọi dữ liệu theo từng bước (snapshot, biểu đồ) đi qua ref/bộ đệm; React chỉ nhận số liệu tóm tắt ~5 lần/giây.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ControllerLog, MapId, Realism, RunResult, SimSnapshot, Team, VehicleDesign } from '@/shared/types';
import type { TeamWorkspace } from '@/collab';
import { saveRun, updateProgress } from '@/lib/api';
import { SimRunner } from './runner';
import { MAX_TIME_S } from './samples';
import { ROLL_KEY, TelemetryBuffer } from './ui/TelemetryChart';

export type RunKind = 'practice' | 'compete';
export type RunStatus = 'idle' | 'loading' | 'running' | 'viewing';

export interface LiveStats {
  t: number;
  rollDeg: number;
  speed: number;
  checkpoints: string[];
  /** thời gian giữ thăng bằng liên tục hiện tại (|roll| ≤ 20°) */
  streakS: number;
  bestStreakS: number;
}

export interface RunInfo {
  kind: RunKind | 'remote';
  mapId: MapId;
  seed: number;
  by?: string;
}

export interface FinishedRun {
  info: RunInfo;
  result: RunResult;
  /** trạng thái lưu kết quả (chỉ lượt Thi của đội) */
  save?: { state: 'saving' | 'saved' | 'error' | 'local'; message?: string };
}

export interface StartOptions {
  mapId: MapId;
  kind: RunKind;
  realism: Realism;
  disturbances: boolean;
  design: VehicleDesign;
  code: string;
  params: Record<string, number>;
}

const BALANCE_LIMIT_DEG = 20;
const MAX_LOGS = 200;

export function useSimRun(ws: TeamWorkspace | null, team: Team | null, opts: { onBalance?: (bestS: number) => void } = {}) {
  const snapRef = useRef<SimSnapshot | null>(null);
  const [telemetry] = useState(() => new TelemetryBuffer());
  const runnerRef = useRef<SimRunner | null>(null);
  const localRunId = useRef<string | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [info, setInfo] = useState<RunInfo | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const [logs, setLogs] = useState<ControllerLog[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const onBalanceRef = useRef(opts.onBalance);
  onBalanceRef.current = opts.onBalance;

  // Đếm thời gian giữ thăng bằng từ snapshot (cho cả lượt của mình và lượt đang xem)
  const streak = useRef({ start: 0, best: 0, lastT: -1, lastUi: 0 });
  const onSnapshot = useCallback(
    (s: SimSnapshot) => {
      snapRef.current = s;
      telemetry.push(s.t, ROLL_KEY, s.rollDeg);
      const st = streak.current;
      if (s.t < st.lastT) Object.assign(st, { start: s.t, best: 0 });
      st.lastT = s.t;
      if (Math.abs(s.rollDeg) > BALANCE_LIMIT_DEG) st.start = s.t;
      const cur = s.t - st.start;
      st.best = Math.max(st.best, cur);
      const now = performance.now();
      if (now - st.lastUi > 200) {
        st.lastUi = now;
        setLive({ t: s.t, rollDeg: s.rollDeg, speed: s.speed, checkpoints: s.checkpoints, streakS: cur, bestStreakS: st.best });
      }
    },
    [telemetry],
  );

  const resetView = useCallback(() => {
    snapRef.current = null;
    telemetry.clear();
    streak.current = { start: 0, best: 0, lastT: -1, lastUi: 0 };
    setLive(null);
    setResetKey((k) => k + 1);
  }, [telemetry]);

  const appendLogs = useCallback((l: ControllerLog[]) => {
    setLogs((prev) => {
      const next = prev.concat(l);
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  }, []);

  const run = ws?.session.run ?? null;

  // ------------------------------------------------------------ Bắt đầu / dừng lượt của máy này

  const start = useCallback(
    async (o: StartOptions) => {
      if (runnerRef.current) return;
      setNotice(null);
      let seed = Math.floor(Math.random() * 1e6);
      if (o.kind === 'compete') {
        if (!run) return;
        const busy = run.busy();
        if (busy) {
          setNotice(`${busy.startedBy?.name ?? 'Đồng đội'} đang chạy thi — chờ lượt đó xong nhé.`);
          return;
        }
        // seed phát cho cả đội để đồng đội dựng đúng bãi đá
        const id = run.start(o.mapId, seed);
        if (!id) {
          setNotice('Đồng đội vừa bấm Thi trước — đang xem lượt của họ.');
          return;
        }
        localRunId.current = id;
      }
      resetView();
      setLogs([]);
      setFinished(null);
      const runInfo: RunInfo = { kind: o.kind, mapId: o.mapId, seed };
      setInfo(runInfo);
      setStatus('loading');
      const runner = new SimRunner({
        config: {
          design: o.design, mapId: o.mapId, seed, realism: o.realism, maxTimeS: MAX_TIME_S[o.mapId], disturbances: o.disturbances,
        },
        code: o.code,
        params: o.params,
        onFrame: (s) => {
          if (runnerRef.current !== runner) return;
          setStatus((st) => (st === 'loading' ? 'running' : st));
          onSnapshot(s);
          if (o.kind === 'compete') run?.frame(s);
          if (o.mapId === 'balance_flat' && o.disturbances) onBalanceRef.current?.(streak.current.best);
        },
        onPlots: (pts) => {
          // mỗi nhãn tối đa một mẫu mỗi ô 50 ms là đủ cho biểu đồ
          for (const p of pts) telemetry.push(p.t, p.label, p.value);
        },
        onLogs: appendLogs,
      });
      runnerRef.current = runner;
      let result: RunResult;
      try {
        result = await runner.run();
      } catch (e) {
        result = {
          mapId: o.mapId, reason: 'code_error', timeS: 0, checkpoints: [], maxRollDeg: 0, balancedS: 0, score: 0,
          errorMessage: e instanceof Error ? e.message : String(e),
        };
      }
      const wasCurrent = runnerRef.current === runner;
      runner.dispose();
      if (wasCurrent) runnerRef.current = null;
      if (o.mapId === 'balance_flat' && o.disturbances) onBalanceRef.current?.(Math.max(result.balancedS, streak.current.best));

      const fin: FinishedRun = { info: runInfo, result };
      if (o.kind === 'compete' && run && localRunId.current) {
        localRunId.current = null;
        if (result.reason === 'stopped') {
          // Người chạy bấm Dừng: huỷ lượt thi, không lưu
          run.abort('Người chạy đã dừng lượt thi');
        } else run.end(result);
        if (result.reason === 'stopped') {
          fin.save = { state: 'local', message: 'Lượt thi đã dừng giữa chừng nên không được lưu.' };
        } else if (team && ws?.kind === 'team') {
          fin.save = { state: 'saving' };
          setFinished({ ...fin });
          const r = await saveRun(team.id, result, o.design);
          fin.save = r.ok ? { state: 'saved' } : { state: 'error', message: r.error };
          if (r.ok && result.mapId === 'balance_flat' && result.balancedS >= 30) void updateProgress(team.id, { stageReached: 3 });
        } else {
          fin.save = { state: 'local', message: 'Chế độ cá nhân: kết quả không được lưu vào lịch sử đội.' };
        }
      }
      setFinished({ ...fin });
      setStatus((st) => (st === 'viewing' ? st : 'idle'));
    },
    [run, team, ws?.kind, resetView, onSnapshot, telemetry, appendLogs],
  );

  const stop = useCallback(() => {
    runnerRef.current?.stop('stopped');
  }, []);

  const push = useCallback((impulse: number) => {
    runnerRef.current?.push(impulse);
  }, []);

  const setParams = useCallback((p: Record<string, number>) => {
    runnerRef.current?.setParams(p);
  }, []);

  // ------------------------------------------------------------ Kênh run của đội: xem lượt đồng đội

  useEffect(() => {
    if (!run) return;
    let viewing: string | null = null;
    const offs = [
      run.onStart((i) => {
        if (i.local) return;
        // Đồng đội bấm Thi: dừng lượt luyện tập của mình để cả đội xem chung
        if (runnerRef.current) {
          runnerRef.current.stop('stopped');
          setNotice(`${i.by.name} bấm Thi — lượt luyện tập của bạn đã dừng để cả đội cùng xem.`);
        }
        viewing = i.runId;
        resetView();
        setFinished(null);
        setInfo({ kind: 'remote', mapId: i.mapId, seed: i.seed, by: i.by.name });
        setStatus('viewing');
      }),
      run.onFrame((s, id) => {
        if (id === viewing) onSnapshot(s);
      }),
      run.onEnd((r, id) => {
        if (id !== viewing) return;
        viewing = null;
        setFinished((f) => ({ info: f?.info ?? { kind: 'remote', mapId: r.mapId, seed: 0 }, result: r }));
        setStatus('idle');
      }),
      run.onCancel((id, reason) => {
        if (id === localRunId.current) {
          // bị đồng đội giành lượt
          localRunId.current = null;
          runnerRef.current?.stop('stopped');
          runnerRef.current = null;
          setNotice(reason);
          return;
        }
        if (id === viewing) {
          viewing = null;
          setNotice(reason);
          setStatus('idle');
        }
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [run, onSnapshot, resetView]);

  // Rời trang: dừng mô phỏng
  useEffect(
    () => () => {
      runnerRef.current?.stop('stopped');
      runnerRef.current = null;
    },
    [],
  );

  return {
    snapRef, telemetry, status, info, live, finished, logs, notice, resetKey,
    start, stop, push, setParams, resetView, clearNotice: () => setNotice(null), clearLogs: () => setLogs([]),
    /** lượt đang chạy là của máy này */
    runningLocally: status === 'running' || status === 'loading',
  };
}
