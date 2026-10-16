// Trình lắp ráp xe 3D (component có kiểm soát): nhận `design`, mọi thay đổi gọi `onChange(designMới)`.
import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Move, Rotate3d } from 'lucide-react';
import type { Vec3, VehicleDesign } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { AssemblerScene, type DropProjector, type GizmoMode, type ViewPreset } from './AssemblerScene';
import {
  FRAME_THICKNESS, GRID_STEP, WHEEL_ITEM_ID, WHEEL_RADIUS, addPart, getPart, movePart, removePart, setFrame, snap,
  updatePart,
} from './design';
import { checkDesignDetailed } from './rules';
import { PRESETS } from './presets';
import { DRAG_MIME, PartPalette } from './ui/PartPalette';
import { FramePanel } from './ui/FramePanel';
import { PartInspector } from './ui/PartInspector';
import { DesignInfo } from './ui/DesignInfo';

export interface AssemblerProps {
  design: VehicleDesign;
  onChange: (design: VehicleDesign) => void;
  /** Chỉ xem, không sửa. */
  readOnly?: boolean;
  /** Linh kiện đang chọn — truyền vào nếu muốn tự quản lý (vd: đồng bộ cho cả đội). */
  selectedUid?: string | null;
  onSelect?: (uid: string | null) => void;
  /** Linh kiện người khác đang chọn: uid → màu viền. */
  remoteSelections?: Record<string, string>;
  /** Hiện ô chọn xe mẫu. Mặc định: có. */
  showPresets?: boolean;
  className?: string;
}

const VIEW_LABEL: Record<ViewPreset, string> = { iso: '3D', side: 'Bên', top: 'Trên', front: 'Trước' };

/** Linh kiện đặt giữa thân xe khi thả từ góc nhìn bên (còn lại gắn lên mặt khung phía người nhìn). */
function mountsOnCenterline(itemId: string): boolean {
  const item = CATALOG_BY_ID[itemId];
  return item?.motor?.kind === 'reaction' || item?.category === 'flywheel' || item?.sensor?.kind === 'lidar_360' || !!item?.battery;
}

export function Assembler({
  design, onChange, readOnly, selectedUid: selectedProp, onSelect: onSelectProp, remoteSelections, showPresets = true,
  className = '',
}: AssemblerProps) {
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const selectedRaw = selectedProp !== undefined ? selectedProp : selectedLocal;
  const selected = selectedRaw && getPart(design, selectedRaw) ? selectedRaw : null;
  const select = useCallback(
    (uid: string | null) => {
      if (onSelectProp) onSelectProp(uid);
      if (selectedProp === undefined) setSelectedLocal(uid);
    },
    [onSelectProp, selectedProp],
  );

  const [mode, setMode] = useState<GizmoMode>('translate');
  const [showSensors, setShowSensors] = useState(true);
  const [view, setView] = useState<ViewPreset>('iso');
  const [viewNonce, setViewNonce] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<DropProjector | null>(null);

  const check = useMemo(() => checkDesignDetailed(design), [design]);
  const problemUids = useMemo(() => new Set(check.problemUids), [check]);
  const selectedPart = selected ? getPart(design, selected) : undefined;
  const isLocked = useCallback((uid: string) => getPart(design, uid)?.itemId === WHEEL_ITEM_ID, [design]);

  // giữ tham chiếu mới nhất để callback ổn định (tránh vẽ lại cảnh 3D)
  const designRef = useRef(design);
  designRef.current = design;
  const change = useCallback((d: VehicleDesign) => { if (!readOnly) onChange(d); }, [onChange, readOnly]);

  const onMove = useCallback(
    (uid: string, pose: { position: Vec3; rotationDeg: Vec3 }) => change(movePart(designRef.current, uid, pose)),
    [change],
  );

  const add = (itemId: string, position?: Vec3) => {
    const r = addPart(design, itemId, { position });
    change(r.design);
    select(r.uid);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const itemId = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
    const item = CATALOG_BY_ID[itemId];
    if (!item) return;
    const hit = dropRef.current?.(e.clientX, e.clientY);
    if (!hit) return add(itemId);
    const [x, y, z] = hit.point;
    const snapUp = (v: number) => Math.ceil(v / GRID_STEP - 1e-9) * GRID_STEP;
    let pos: Vec3;
    if (hit.facing === 'side') {
      const side = mountsOnCenterline(itemId) ? 0 : hit.sign * snapUp(FRAME_THICKNESS / 2 + item.size[2] / 2);
      pos = [snap(x), snap(y), side];
    } else if (hit.facing === 'top') {
      pos = [snap(x), snapUp(y + item.size[1] / 2), snap(z)];
    } else {
      pos = [hit.sign * snap(design.frame.wheelbase / 2 - WHEEL_RADIUS - item.size[0] / 2 - 0.005), snap(y), snap(z)];
    }
    pos[1] = Math.max(pos[1], snapUp(item.size[1] / 2 + 0.015)); // không cho chạm đất
    add(itemId, pos);
  };

  const duplicate = () => {
    if (!selectedPart) return;
    const item = CATALOG_BY_ID[selectedPart.itemId];
    const p = selectedPart.position;
    const r = addPart(design, selectedPart.itemId, {
      position: [p[0], snap(p[1] + item.size[1] + GRID_STEP), p[2]],
      rotationDeg: selectedPart.rotationDeg,
    });
    change(r.design);
    select(r.uid);
  };

  const remove = () => {
    if (!selectedPart || isLocked(selectedPart.uid)) return;
    change(removePart(design, selectedPart.uid));
    select(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPart) { e.preventDefault(); remove(); }
    else if (e.key === 'g' || e.key === 'G') setMode('translate');
    else if (e.key === 'r' || e.key === 'R') setMode('rotate');
    else if (e.key === 'Escape') select(null);
  };

  const changeView = (v: ViewPreset) => { setView(v); setViewNonce((n) => n + 1); };

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`flex h-full min-h-[560px] w-full overflow-hidden bg-surface text-ink outline-none ${className}`}
    >
      {/* ------------------------------------------------ cột trái: tên xe, khung, kho linh kiện */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="space-y-2 border-b border-line p-3">
          <input
            value={design.name}
            disabled={readOnly}
            onChange={(e) => change({ ...design, name: e.target.value })}
            className="w-full rounded-md border border-transparent px-1 py-0.5 text-base font-semibold outline-none hover:border-line focus:border-brand"
            aria-label="Tên xe"
          />
          {showPresets && !readOnly && (
            <select
              value=""
              onChange={(e) => {
                const preset = PRESETS.find((p) => p.id === e.target.value);
                if (preset && window.confirm(`Thay toàn bộ thiết kế hiện tại bằng "${preset.title}"?`)) {
                  change(preset.create());
                  select(null);
                }
              }}
              className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink-soft outline-none"
            >
              <option value="">Bắt đầu từ xe mẫu…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.title} — {p.summary}</option>
              ))}
            </select>
          )}
        </div>
        <details open className="border-b border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">Khung xe</summary>
          <FramePanel design={design} disabled={readOnly} onFrame={(patch) => change(setFrame(design, patch))} />
        </details>
        <div className="px-3 pb-1 pt-2 text-sm font-semibold">Kho linh kiện</div>
        <div className="min-h-0 flex-1">
          <PartPalette onAdd={(id) => add(id)} disabled={readOnly} />
        </div>
      </aside>

      {/* ------------------------------------------------ giữa: cảnh 3D */}
      <main
        className={`relative min-w-0 flex-1 ${dragOver ? 'ring-4 ring-inset ring-brand/50' : ''}`}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <AssemblerScene
          design={design}
          selectedUid={selected}
          problemUids={problemUids}
          centerOfMass={check.centerOfMass}
          showSensors={showSensors}
          mode={mode}
          view={view}
          viewNonce={viewNonce}
          readOnly={readOnly}
          remoteSelections={remoteSelections}
          isLocked={isLocked}
          onSelect={select}
          onMove={onMove}
          dropRef={dropRef}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2">
          <div className="pointer-events-auto flex gap-1 rounded-lg bg-surface/90 p-1 shadow">
            <ToolButton active={mode === 'translate'} onClick={() => setMode('translate')} title="Di chuyển (G)">
              <Move className="h-4 w-4" /> Di chuyển
            </ToolButton>
            <ToolButton active={mode === 'rotate'} onClick={() => setMode('rotate')} title="Xoay (R)">
              <Rotate3d className="h-4 w-4" /> Xoay
            </ToolButton>
            <ToolButton active={showSensors} onClick={() => setShowSensors((v) => !v)} title="Hiện vùng đo của cảm biến">
              {showSensors ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Tia cảm biến
            </ToolButton>
          </div>
          <div className="pointer-events-auto flex gap-1 rounded-lg bg-surface/90 p-1 shadow">
            {(Object.keys(VIEW_LABEL) as ViewPreset[]).map((v) => (
              <ToolButton key={v} active={view === v && viewNonce > 0} onClick={() => changeView(v)} title={`Nhìn ${VIEW_LABEL[v]}`}>
                {VIEW_LABEL[v]}
              </ToolButton>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 text-center text-xs text-ink-soft">
          Kéo chuột để xoay góc nhìn · cuộn để phóng to · bấm linh kiện để chọn · lưới bắt 5 mm · khung nét đứt = giới hạn 35 × 15 × 30 cm
        </div>
      </main>

      {/* ------------------------------------------------ cột phải: linh kiện đang chọn + thông số */}
      <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-line p-3">
        {selectedPart ? (
          <section className="rounded-lg border border-brand/40 bg-orange-50/40 p-3">
            <PartInspector
              design={design}
              part={selectedPart}
              locked={isLocked(selectedPart.uid)}
              disabled={readOnly}
              onRename={(name) => change(updatePart(design, selectedPart.uid, { name }))}
              onPatch={(patch) => change(updatePart(design, selectedPart.uid, patch))}
              onPose={(pose) => change(movePart(design, selectedPart.uid, pose))}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          </section>
        ) : (
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-soft">
            Bấm vào một linh kiện trên xe để đổi tên, chọn chân cắm, di chuyển hoặc xoá.
          </p>
        )}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Thông số xe</h3>
          <DesignInfo design={design} check={check} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Linh kiện trên xe ({design.parts.length})</h3>
          <ul className="space-y-0.5 text-xs">
            {design.parts.map((p) => (
              <li key={p.uid}>
                <button
                  type="button"
                  onClick={() => select(p.uid)}
                  className={`flex w-full justify-between gap-2 rounded px-2 py-1 text-left hover:bg-surface-2 ${
                    p.uid === selected ? 'bg-orange-100' : ''
                  } ${problemUids.has(p.uid) ? 'text-red-700' : ''}`}
                >
                  <span className="font-mono">{p.name}</span>
                  <span className="truncate text-ink-soft">{CATALOG_BY_ID[p.itemId]?.name ?? p.itemId}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function ToolButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
        active ? 'bg-brand text-white' : 'text-ink hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
