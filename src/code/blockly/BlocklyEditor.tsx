// Trình soạn khối Blockly. Phát onChange sau MỖI thao tác khối (gộp các sự kiện cùng một thao tác),
// và nhận value từ ngoài (Yjs của đồng đội) mà không phát lại onChange → không lặp vòng đồng bộ.

import { useEffect, useRef } from 'react';
import type { VehicleDesign } from '@/shared/types';
import { Blockly, setupBlockly, workspaceToJs } from './blocks';
import { partOptionsFromDesign, setPartOptions } from './parts';
import { TOOLBOX } from './toolbox';

export interface BlocklyChangeInfo {
  /** JavaScript sinh từ workspace, chạy được bằng ControllerRuntime. */
  js: string;
}

export interface BlocklyEditorProps {
  /** Tên linh kiện (tên đặt khi lắp ráp) cho các dropdown. */
  partNames: string[];
  /** Nếu có: lọc dropdown theo loại (động cơ/servo/cảm biến/encoder). */
  design?: VehicleDesign | null;
  /** JSON workspace (Blockly.serialization.workspaces.save). null = workspace trống. */
  value: object | null;
  onChange?: (json: object, info: BlocklyChangeInfo) => void;
  /** Chỉ đọc — chỉ áp dụng khi tạo editor. */
  readOnly?: boolean;
  /** Nhận workspace sau khi tạo (để tô sáng khối, cuộn...). */
  onReady?: (ws: Blockly.WorkspaceSvg) => void;
  className?: string;
}

const NON_CONTENT_EVENTS = new Set<string>([
  Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE,
  Blockly.Events.FINISHED_LOADING,
]);

export default function BlocklyEditor({ partNames, design, value, onChange, readOnly, onReady, className }: BlocklyEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const lastJsonRef = useRef<string>('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Danh sách tên linh kiện cho dropdown
  useEffect(() => {
    setPartOptions(design ? partOptionsFromDesign(design) : partNames);
  }, [design, partNames]);

  // Tạo workspace một lần
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setupBlockly();
    setPartOptions(design ? partOptionsFromDesign(design) : partNames);
    const ws = Blockly.inject(host, {
      toolbox: TOOLBOX,
      renderer: 'zelos',
      readOnly: !!readOnly,
      trashcan: true,
      grid: { spacing: 24, length: 2, colour: '#e2e8f0', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    wsRef.current = ws;
    applyExternal(ws, valueRef.current, lastJsonRef);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const emit = () => {
      timer = null;
      if (ws.isDragging()) { timer = setTimeout(emit, 50); return; }
      const json = Blockly.serialization.workspaces.save(ws);
      const str = JSON.stringify(json);
      if (str === lastJsonRef.current) return;
      lastJsonRef.current = str;
      lastIncoming.delete(ws);
      onChangeRef.current?.(json, { js: workspaceToJs(ws) });
    };
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || NON_CONTENT_EVENTS.has(e.type)) return;
      if (!timer) timer = setTimeout(emit, 0); // gộp các sự kiện của cùng một thao tác
    };
    ws.addChangeListener(listener);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host);
    onReady?.(ws);

    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
      ws.removeChangeListener(listener);
      ws.dispose();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Nhận thay đổi từ ngoài
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      if (ws.isDragging()) { retry = setTimeout(apply, 100); return; } // đợi thả khối rồi mới áp
      applyExternal(ws, value, lastJsonRef);
    };
    apply();
    return () => { if (retry) clearTimeout(retry); };
  }, [value]);

  return <div ref={hostRef} className={className ?? 'h-full w-full min-h-[400px]'} />;
}

// Chuỗi JSON nhận từ ngoài lần gần nhất (có thể khác định dạng save()) — tránh nạp lại cùng nội dung.
const lastIncoming = new WeakMap<Blockly.WorkspaceSvg, string>();

/** Nạp JSON vào workspace với sự kiện tắt → không phát onChange. Bỏ qua nếu trùng nội dung hiện có. */
function applyExternal(ws: Blockly.WorkspaceSvg, value: object | null, lastJsonRef: { current: string }): void {
  const str = value ? JSON.stringify(value) : '';
  if (str === lastJsonRef.current || str === lastIncoming.get(ws)) return;
  lastIncoming.set(ws, str);
  Blockly.Events.disable();
  try {
    if (value) Blockly.serialization.workspaces.load(value, ws, { recordUndo: false });
    else ws.clear();
  } catch (e) {
    console.error('Không nạp được workspace Blockly', e);
  } finally {
    Blockly.Events.enable();
  }
  // Đồng bộ lại chuỗi so sánh theo đúng định dạng save() để lần phát sau không bị coi là thay đổi
  lastJsonRef.current = JSON.stringify(Blockly.serialization.workspaces.save(ws));
}
