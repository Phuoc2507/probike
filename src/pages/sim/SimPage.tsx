// Trang /mo-phong: Lắp ráp → Cân bằng (PID) → Sa hình, trên không gian làm việc chung của đội (Yjs realtime)
// hoặc chế độ luyện tập cá nhân (localStorage) khi chưa đăng nhập / chưa có đội.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Home, Lock, LogIn, RotateCcw, Users, Wifi, WifiOff } from 'lucide-react';
import type { Stage, Team, VehicleDesign } from '@/shared/types';
import { useAuth } from '@/lib/useAuth';
import { useMyTeam } from '@/lib/useMyTeam';
import { updateProgress } from '@/lib/api';
import { useBlocklyJson, useCode, useDesign, useMode, usePidParams, useTeamWorkspace, type SeedDefaults, type TeamWorkspace } from '@/collab';
import { checkDesign, Assembler } from '@/assembly';
import { MAP_NAMES } from '@/sim';
import { LogoMark } from '@/components/site/Logo';
import { createSampleVehicle } from './sampleVehicle';
import { DEFAULT_PARAMS, UNLOCK_BALANCE_S, samplePidBlocks, samplePidCode } from './samples';
import { namesFromDesign } from './designNames';
import { useSimRun } from './useSimRun';
import { RunStage } from './stages/RunStage';

/** Khoá trong params của workspace: thời gian giữ thăng bằng tốt nhất (có đẩy) — cả đội dùng chung. */
const BALANCE_KEY = '_giuThangBangS';

// Hạt giống workspace phải giống hệt nhau trên mọi máy → dựng một lần ở cấp module
const SAMPLE_VEHICLE = createSampleVehicle();
const SAMPLE_NAMES = namesFromDesign(SAMPLE_VEHICLE);
const SEED: SeedDefaults = {
  design: SAMPLE_VEHICLE,
  code: samplePidCode(SAMPLE_NAMES),
  blockly: samplePidBlocks(SAMPLE_NAMES),
  mode: 'code',
  params: DEFAULT_PARAMS,
};

const STAGES: { id: Stage; title: string; focus: string }[] = [
  { id: 1, title: 'Lắp ráp', focus: 'assembly' },
  { id: 2, title: 'Cân bằng', focus: 'balance' },
  { id: 3, title: 'Sa hình', focus: 'course' },
];
const STAGE_KEY = 'probike:mo-phong:giai-doan';

export default function SimPage() {
  const auth = useAuth();
  const myTeam = useMyTeam();
  const waiting = auth.loading || myTeam.loading;
  // Chờ biết đội rồi mới mở workspace (tránh mở chế độ cá nhân rồi chuyển sang đội)
  const ws = useTeamWorkspace(waiting ? null : myTeam.team?.id ?? null, { seed: SEED });

  if (waiting || !ws) return <FullScreenMessage text="Đang tải trình mô phỏng…" />;
  if (!ws.ready) {
    return (
      <FullScreenMessage
        text={ws.loadError ? `Chưa tải được bài làm của đội: ${ws.loadError}` : 'Đang đồng bộ bài làm của đội…'}
        action={ws.loadError ? { label: 'Thử lại', onClick: ws.retryLoad } : undefined}
      />
    );
  }
  return <SimWorkspace ws={ws} team={myTeam.team} loggedIn={!!auth.user} />;
}

function SimWorkspace({ ws, team, loggedIn }: { ws: TeamWorkspace; team: Team | null; loggedIn: boolean }) {
  const teamId = team?.id ?? null;
  const teamName = team?.name ?? null;
  const [designRaw, setDesign] = useDesign(ws.session);
  const design: VehicleDesign = designRaw ?? SAMPLE_VEHICLE;
  const [mode, setMode] = useMode(ws.session);
  const [code, setCode] = useCode(ws.session);
  const [blocklyRaw, setBlockly] = useBlocklyJson(ws.session);
  const blockly = (blocklyRaw as object | null) ?? null;
  const [params, setParam] = usePidParams(ws.session);
  const balanceBestS = Number(params[BALANCE_KEY] ?? 0);

  const check = useMemo(() => checkDesign(design), [design]);
  const canBalance = check.ok;
  const canCourse = check.ok && balanceBestS >= UNLOCK_BALANCE_S;

  const [stage, setStageRaw] = useState<Stage>(() => {
    const v = Number(safeGet(STAGE_KEY));
    return v === 2 || v === 3 ? (v as Stage) : 1;
  });
  const allowed = (s: Stage) => s === 1 || (s === 2 ? canBalance : canCourse);
  const effStage: Stage = allowed(stage) ? stage : canBalance && stage === 3 ? 2 : 1;
  const setStage = (s: Stage) => {
    if (!allowed(s)) return;
    setStageRaw(s);
    safeSet(STAGE_KEY, String(s));
  };

  // Presence: cho đồng đội biết mình đang ở giai đoạn nào
  useEffect(() => {
    ws.session.setFocus(STAGES[effStage - 1].focus);
  }, [ws.session, effStage]);

  // Kỷ lục giữ thăng bằng: ghi vào workspace khi vượt mốc 5 s (tránh ghi liên tục) và khi kết thúc lượt
  const bestRef = useRef(balanceBestS);
  bestRef.current = Math.max(bestRef.current, balanceBestS);
  const onBalance = useCallback(
    (s: number) => {
      const v = Math.round(s * 10) / 10;
      const prev = bestRef.current;
      if (v <= prev) return;
      if (Math.floor(v / 5) > Math.floor(prev / 5) || v >= UNLOCK_BALANCE_S) {
        bestRef.current = v;
        setParam(BALANCE_KEY, v);
      }
    },
    [setParam],
  );
  const sim = useSimRun(ws, team, { onBalance });

  // Tiến độ đội: giai đoạn đạt được + thời gian giữ thăng bằng
  const reported = useRef<{ stage: number; balance: number }>({ stage: 0, balance: 0 });
  const stageReached: Stage = canCourse ? 3 : canBalance ? 2 : 1;
  useEffect(() => {
    if (!teamId || ws.kind !== 'team') return;
    const r = reported.current;
    if (stageReached <= r.stage && balanceBestS <= r.balance) return;
    reported.current = { stage: Math.max(r.stage, stageReached), balance: Math.max(r.balance, balanceBestS) };
    void updateProgress(teamId, { stageReached, ...(balanceBestS > 0 ? { balanceBestS } : {}) });
  }, [teamId, ws.kind, stageReached, balanceBestS]);

  // Đồng đội bấm Thi → banner xem chung, kể cả khi mình đang ở trang Lắp ráp
  const remote = sim.status === 'viewing' && sim.info?.kind === 'remote' ? sim.info : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-2 text-ink">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-white px-3 py-1.5">
        <Link to="/" className="flex items-center gap-1.5 text-sm font-bold text-ink" title="Về trang chủ">
          <LogoMark className="h-7 w-7" />
          <span className="hidden sm:inline">ProBike</span>
          <Home className="h-3.5 w-3.5 text-ink-soft sm:hidden" />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Giai đoạn">
          {STAGES.map((s, i) => {
            const ok = allowed(s.id);
            const done = s.id < stageReached;
            return (
              <div key={s.id} className="flex items-center gap-1">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
                <button
                  type="button"
                  onClick={() => setStage(s.id)}
                  disabled={!ok}
                  title={
                    ok
                      ? s.title
                      : s.id === 2
                        ? 'Sửa hết lỗi lắp ráp để sang giai đoạn Cân bằng'
                        : `Giữ thăng bằng ≥ ${UNLOCK_BALANCE_S} giây (có đẩy) để mở khoá Sa hình`
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                    effStage === s.id
                      ? 'bg-brand text-white'
                      : ok
                        ? 'bg-surface-2 text-ink hover:bg-orange-100'
                        : 'cursor-not-allowed bg-surface-2 text-slate-400'
                  }`}
                >
                  {!ok ? <Lock className="h-3.5 w-3.5" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-xs">{s.id}</span>}
                  {s.title}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <WorkspaceBadge ws={ws} teamName={teamName} />
          <Presence ws={ws} />
          {ws.kind === 'personal' &&
            (loggedIn ? (
              <span className="hidden text-ink-soft lg:inline">Bạn chưa thuộc đội nào</span>
            ) : (
              <Link to="/dang-nhap" className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-medium text-ink hover:bg-surface-2">
                <LogIn className="h-3.5 w-3.5" /> Đăng nhập để làm cùng đội
              </Link>
            ))}
          {ws.kind === 'personal' && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Xoá bài luyện tập lưu trên máy này và bắt đầu lại từ xe mẫu?')) ws.resetPersonal();
              }}
              className="rounded-md p-1 text-ink-soft hover:bg-surface-2 hover:text-ink"
              title="Xoá bài luyện tập trên máy này"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {remote && effStage === 1 && (
        <div className="flex items-center gap-3 bg-brand px-3 py-1.5 text-sm text-white">
          <span className="flex-1">
            <b>{remote.by}</b> đang chạy thi <b>{MAP_NAMES[remote.mapId]}</b> — cả đội cùng xem.
          </span>
          <button
            type="button"
            onClick={() => setStage(remote.mapId === 'balance_flat' ? 2 : canCourse ? 3 : 2)}
            className="rounded bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
          >
            Xem ngay
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1">
        {effStage === 1 && (
          <AssemblyStage
            design={design}
            onChange={setDesign}
            errors={check.errors}
            onNext={() => setStage(2)}
          />
        )}
        {effStage !== 1 && (
          <RunStage
            key={effStage}
            stage={effStage as 2 | 3}
            sim={sim}
            design={design}
            mode={mode}
            setMode={setMode}
            code={code}
            setCode={setCode}
            blockly={blockly}
            setBlockly={setBlockly}
            params={params}
            setParam={setParam}
            balanceBestS={balanceBestS}
            competeHint={
              ws.kind === 'team'
                ? 'Thi: cả đội cùng xem, kết quả lưu vào lịch sử đội'
                : 'Thi ở chế độ cá nhân: kết quả không được lưu (đăng nhập và vào đội để lưu)'
            }
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Giai đoạn 1

function AssemblyStage({
  design, onChange, errors, onNext,
}: { design: VehicleDesign; onChange: (d: VehicleDesign) => void; errors: string[]; onNext: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Assembler design={design} onChange={onChange} className="min-h-0 flex-1" />
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-white px-3 py-2">
        {errors.length ? (
          <p className="flex-1 text-sm text-red-700">
            Còn <b>{errors.length}</b> lỗi lắp ráp: {errors[0]}
            {errors.length > 1 ? ' …' : ''}
          </p>
        ) : (
          <p className="flex-1 text-sm text-emerald-700">✓ Xe hợp lệ theo luật thi. Sang bước lập trình cân bằng.</p>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={errors.length > 0}
          className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          title={errors.length ? 'Sửa hết lỗi để tiếp tục' : undefined}
        >
          Tiếp: Cân bằng <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Header

function WorkspaceBadge({ ws, teamName }: { ws: TeamWorkspace; teamName: string | null }) {
  if (ws.kind === 'personal') {
    return (
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-soft" title="Bài làm lưu trong trình duyệt của máy này">
        Luyện tập cá nhân · lưu trên máy
      </span>
    );
  }
  const online = ws.status === 'online';
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
      title={ws.error ? `Lỗi lưu: ${ws.error}` : ws.saving ? 'Đang lưu…' : 'Đã lưu lên máy chủ'}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <Users className="h-3.5 w-3.5" />
      <span className="max-w-[10rem] truncate font-medium">{teamName ?? 'Đội'}</span>
      <span className="hidden md:inline">· {online ? (ws.saving ? 'đang lưu…' : 'trực tuyến') : 'mất kết nối'}</span>
    </span>
  );
}

const FOCUS_LABEL: Record<string, string> = { assembly: 'Lắp ráp', balance: 'Cân bằng', course: 'Sa hình' };

function Presence({ ws }: { ws: TeamWorkspace }) {
  if (ws.kind === 'personal') return null;
  const peers = ws.peers;
  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${peers.length} thành viên đang online`}>
      {peers.slice(0, 6).map((p) => (
        <span
          key={p.sessionId}
          title={`${p.name}${p.focus ? ` — đang ở ${FOCUS_LABEL[p.focus] ?? p.focus}` : ''}`}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white"
          style={{ backgroundColor: p.color }}
        >
          {initials(p.name)}
        </span>
      ))}
      {peers.length > 6 && <span className="pl-2 text-ink-soft">+{peers.length - 6}</span>}
    </div>
  );
}

function initials(name: string): string {
  const w = name.trim().split(/\s+/);
  return (w.length > 1 ? w[w.length - 1][0] : w[0]?.[0] ?? '?').toUpperCase();
}

function FullScreenMessage({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center text-ink-soft">
      <LogoMark className="h-10 w-10 animate-pulse" />
      <p>{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white">
          {action.label}
        </button>
      )}
    </div>
  );
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* bỏ qua */
  }
}
