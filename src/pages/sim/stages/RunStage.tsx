// Giai đoạn 2 (Cân bằng) và 3 (Sa hình): chương trình bên trái, 3D + biểu đồ + điều khiển bên phải.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftToLine, ArrowRightToLine, Play, Square, Trophy } from 'lucide-react';
import type { MapId, Realism, VehicleDesign } from '@/shared/types';
import type { CodeError } from '@/code';
import { blocksJsonToJs } from '@/code';
import type { WorkspaceMode } from '@/collab';
import { MAP_IDS, MAP_NAMES, PAR_TIME_S } from '@/sim';
import { checkDesign } from '@/assembly';
import { SimViewport } from '../scene/SimViewport';
import { EditorPanel } from '../ui/EditorPanel';
import { TutorialPanel } from '../ui/TutorialPanel';
import { ParamSliders } from '../ui/ParamSliders';
import { ResultPanel } from '../ui/ResultPanel';
import { TelemetryChart } from '../ui/TelemetryChart';
import { SIM_PARAMS, SPEED_PARAM, samplePidBlocks, samplePidCode } from '../samples';
import { hasImu, namesFromDesign } from '../designNames';
import type { useSimRun } from '../useSimRun';

export interface RunStageProps {
  stage: 2 | 3;
  sim: ReturnType<typeof useSimRun>;
  design: VehicleDesign;
  mode: WorkspaceMode;
  setMode: (m: WorkspaceMode) => void;
  code: string;
  setCode: (c: string) => void;
  blockly: object | null;
  setBlockly: (j: object) => void;
  params: Record<string, number>;
  setParam: (k: string, v: number) => void;
  balanceBestS: number;
  /** có thể Thi (có workspace) — chế độ cá nhân vẫn thi được nhưng không lưu */
  competeHint: string;
}

const PUSH_IMPULSE = 0.05; // N·s, gợi ý của lõi mô phỏng
const COURSE_MAPS = MAP_IDS.filter((m) => m !== 'balance_flat');

function parseError(msg: string | undefined): CodeError | null {
  if (!msg) return null;
  const m = /Dòng\s+(\d+)/.exec(msg);
  return { message: msg, line: m ? Number(m[1]) : undefined };
}

export function RunStage(props: RunStageProps) {
  const { stage, sim, design, mode, setMode, code, setCode, blockly, setBlockly, params, setParam, balanceBestS } = props;
  const names = useMemo(() => namesFromDesign(design), [design]);
  const [leftTab, setLeftTab] = useState<'guide' | 'program'>(stage === 2 ? 'guide' : 'program');
  const [courseMap, setCourseMap] = useState<MapId>('straight');
  const [realism, setRealism] = useState<Realism>('medium');
  const [disturbances, setDisturbances] = useState(true);
  const mapId: MapId = stage === 2 ? 'balance_flat' : courseMap;

  const busy = sim.status !== 'idle';
  const local = sim.runningLocally;
  // Đang chạy/xem: dựng đúng sa hình của lượt đó (seed quyết định bãi đá); rảnh: sa hình đang chọn
  const viewMap = sim.info && (busy || sim.info.mapId === mapId) ? sim.info : { mapId, seed: 1 };
  // Đổi map khi đang rảnh → bỏ hình lượt cũ
  useEffect(() => {
    if (!busy && sim.info && sim.info.mapId !== mapId) sim.resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  const sliders = stage === 3 ? [...SIM_PARAMS, SPEED_PARAM] : SIM_PARAMS;
  const runParams = useMemo(() => {
    const p: Record<string, number> = {};
    for (const s of [...SIM_PARAMS, SPEED_PARAM]) p[s.name] = params[s.name] ?? s.default;
    if (stage === 2) p[SPEED_PARAM.name] = 0; // Cân bằng: đứng yên tại chỗ
    return p;
  }, [params, stage]);

  // Kéo thanh trượt khi đang chạy → có tác dụng ngay
  useEffect(() => {
    if (local) sim.setParams(runParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runParams, local]);

  const check = useMemo(() => checkDesign(design), [design]);
  const [warn, setWarn] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  useEffect(() => {
    const r = sim.finished?.result;
    setCodeError(r?.reason === 'code_error' ? parseError(r.errorMessage) : null);
  }, [sim.finished]);

  const go = (kind: 'practice' | 'compete') => {
    setWarn(null);
    if (!check.ok) return setWarn('Xe chưa hợp lệ — quay lại Lắp ráp để sửa lỗi trước khi chạy.');
    if (!hasImu(design)) setWarn('Xe chưa lắp IMU: imu.roll() luôn trả 0, xe sẽ không cân bằng được.');
    let source = code;
    if (mode === 'blocks') {
      try {
        source = blocksJsonToJs(blockly);
      } catch (e) {
        return setWarn(`Không đọc được chương trình khối: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    void sim.start({
      mapId, kind, realism, disturbances: stage === 2 ? disturbances || kind === 'compete' : false, design, code: source, params: runParams,
    });
  };

  const loadSample = () => {
    if (!window.confirm(`Thay chương trình ${mode === 'blocks' ? 'khối' : 'code'} hiện tại bằng mẫu PID?`)) return;
    if (mode === 'blocks') setBlockly(samplePidBlocks(names));
    else setCode(samplePidCode(names));
  };

  const useTutorialCode = (c: string) => {
    if (code.trim() && code !== c && !window.confirm('Thay code hiện tại bằng code của bước này?')) return;
    setCode(c);
    setMode('code');
    setLeftTab('program');
  };

  const resetParams = () => sliders.forEach((s) => setParam(s.name, s.default));

  const btn = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(300px,40%)_1fr]">
      {/* ---------------- Trái: hướng dẫn / chương trình */}
      <div className="flex min-h-[320px] flex-col border-r border-line md:min-h-0">
        {stage === 2 && (
          <div className="flex border-b border-line bg-surface-2 text-sm">
            {(['guide', 'program'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLeftTab(t)}
                className={`flex-1 px-3 py-1.5 font-medium ${leftTab === t ? 'bg-white text-ink shadow-[inset_0_-2px_0_var(--color-brand)]' : 'text-ink-soft hover:text-ink'}`}
              >
                {t === 'guide' ? 'Hướng dẫn PID' : 'Chương trình'}
              </button>
            ))}
          </div>
        )}
        {stage === 2 && leftTab === 'guide' ? (
          <TutorialPanel className="min-h-0 flex-1" names={names} balanceBestS={balanceBestS} onUseCode={useTutorialCode} />
        ) : (
          <EditorPanel
            className="min-h-0 flex-1"
            design={design}
            mode={mode}
            setMode={setMode}
            code={code}
            setCode={setCode}
            blockly={blockly}
            setBlockly={setBlockly}
            error={codeError}
            onLoadSample={loadSample}
          />
        )}
      </div>

      {/* ---------------- Phải: điều khiển + 3D + biểu đồ */}
      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-1.5">
          {stage === 3 ? (
            <select
              value={courseMap}
              onChange={(e) => setCourseMap(e.target.value as MapId)}
              disabled={busy}
              className="rounded-md border border-line bg-white px-2 py-1 text-sm"
              title="Chọn sa hình"
            >
              {COURSE_MAPS.map((m) => (
                <option key={m} value={m}>
                  {MAP_NAMES[m]}
                  {PAR_TIME_S[m] ? ` (chuẩn ${PAR_TIME_S[m]} s)` : ''}
                </option>
              ))}
            </select>
          ) : (
            <label className="flex items-center gap-1.5 text-sm text-ink" title="Lực đẩy ngẫu nhiên mỗi 2–4 giây (bắt buộc để mở khoá Sa hình)">
              <input type="checkbox" checked={disturbances} disabled={busy} onChange={(e) => setDisturbances(e.target.checked)} className="accent-[var(--color-brand)]" />
              Đẩy ngẫu nhiên
            </label>
          )}
          <select
            value={realism}
            onChange={(e) => setRealism(e.target.value as Realism)}
            disabled={busy}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm"
            title="Độ thực tế của cảm biến: nhiễu và độ trễ"
          >
            <option value="low">Độ thực tế: thấp</option>
            <option value="medium">Độ thực tế: vừa</option>
            <option value="high">Độ thực tế: cao</option>
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {stage === 2 && (
              <>
                <button type="button" className={`${btn} border border-line bg-white text-ink hover:bg-surface-2`} disabled={!local} onClick={() => sim.push(-PUSH_IMPULSE)} title="Đẩy xe sang trái">
                  <ArrowLeftToLine className="h-4 w-4" /> Đẩy
                </button>
                <button type="button" className={`${btn} border border-line bg-white text-ink hover:bg-surface-2`} disabled={!local} onClick={() => sim.push(PUSH_IMPULSE)} title="Đẩy xe sang phải">
                  Đẩy <ArrowRightToLine className="h-4 w-4" />
                </button>
              </>
            )}
            {local ? (
              <button type="button" className={`${btn} bg-ink text-white hover:bg-slate-700`} onClick={sim.stop}>
                <Square className="h-4 w-4" /> Dừng
              </button>
            ) : (
              <button type="button" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy} onClick={() => go('practice')} title="Chạy thử trên máy này (không lưu)">
                <Play className="h-4 w-4" /> Chạy
              </button>
            )}
            <button
              type="button"
              className={`${btn} bg-brand text-white hover:bg-brand-dark`}
              disabled={busy}
              onClick={() => go('compete')}
              title={props.competeHint}
            >
              <Trophy className="h-4 w-4" /> Thi
            </button>
          </div>
        </div>

        {(warn || sim.notice) && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <span className="flex-1">{warn ?? sim.notice}</span>
            <button type="button" onClick={() => { setWarn(null); sim.clearNotice(); }} className="text-amber-700 hover:underline">Ẩn</button>
          </div>
        )}

        <SimViewport
          className="min-h-[200px] flex-1"
          design={design}
          mapId={viewMap.mapId}
          seed={viewMap.seed}
          snapRef={sim.snapRef}
          resetKey={sim.resetKey}
        />

        <div className="grid h-[clamp(170px,30vh,250px)] shrink-0 grid-cols-[1fr_190px] gap-3 border-t border-line bg-white p-2 lg:grid-cols-[1fr_200px_220px]">
          <TelemetryChart buffer={sim.telemetry} className="h-full" />
          <ParamSliders
            className="hidden overflow-y-auto lg:block"
            sliders={sliders}
            values={runParams}
            onChange={setParam}
            onReset={resetParams}
          />
          <ResultPanel status={sim.status} info={sim.info} live={sim.live} finished={sim.finished} logs={sim.logs} />
        </div>
        {/* Màn hình hẹp: thanh trượt xuống dưới */}
        <div className="border-t border-line bg-white p-2 lg:hidden">
          <ParamSliders sliders={sliders} values={runParams} onChange={setParam} onReset={resetParams} className="grid grid-cols-2 gap-x-4 space-y-0" />
        </div>
      </div>
    </div>
  );
}
