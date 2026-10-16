// Trình soạn chương trình: chuyển qua lại giữa Khối (Blockly) và Code (CodeMirror); xem code Arduino C++.
// Nội dung lấy từ workspace Yjs → cả đội cùng thấy khi một người sửa.
import { useMemo, useState } from 'react';
import { Blocks, Code2, Cpu, Wand2 } from 'lucide-react';
import type { VehicleDesign } from '@/shared/types';
import type { CodeError } from '@/code';
import { ArduinoCodeView, BlocklyEditor, CodeEditor, blocksJsonToJs } from '@/code';
import type { WorkspaceMode } from '@/collab';
import { partNamesOf } from '../designNames';

export interface EditorPanelProps {
  design: VehicleDesign;
  mode: WorkspaceMode;
  setMode: (m: WorkspaceMode) => void;
  code: string;
  setCode: (c: string) => void;
  blockly: object | null;
  setBlockly: (j: object) => void;
  error: CodeError | null;
  /** Nút nạp code mẫu (tuỳ giai đoạn). */
  onLoadSample?: () => void;
  className?: string;
}

type Tab = WorkspaceMode | 'arduino';

export function EditorPanel({
  design, mode, setMode, code, setCode, blockly, setBlockly, error, onLoadSample, className = '',
}: EditorPanelProps) {
  const [arduino, setArduino] = useState(false);
  const tab: Tab = arduino ? 'arduino' : mode;
  const partNames = useMemo(() => partNamesOf(design), [design]);

  const choose = (t: Tab) => {
    if (t === 'arduino') return setArduino(true);
    setArduino(false);
    setMode(t);
  };

  const copyBlocksToCode = () => {
    const js = blocksJsonToJs(blockly);
    if (code.trim() && !window.confirm('Thay toàn bộ code hiện tại bằng code sinh từ khối?')) return;
    setCode(js);
    setMode('code');
  };

  const tabBtn = (t: Tab, label: string, Icon: typeof Blocks, title: string) => (
    <button
      type="button"
      onClick={() => choose(t)}
      title={title}
      className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium ${
        tab === t ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex flex-wrap items-end gap-1 border-b border-line bg-white px-2">
        {tabBtn('blocks', 'Khối', Blocks, 'Lập trình kéo thả — chương trình chạy là chương trình khối')}
        {tabBtn('code', 'Code', Code2, 'Viết JavaScript kiểu Arduino — chương trình chạy là code này')}
        {tabBtn('arduino', 'Arduino C++', Cpu, 'Code C++ sinh từ khối để nạp vào xe thật')}
        <div className="ml-auto flex items-center gap-1 pb-1">
          {tab !== 'arduino' && (
            <span className="hidden rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-soft xl:inline">
              Đang chạy: <b className="text-ink">{mode === 'blocks' ? 'khối' : 'code'}</b>
            </span>
          )}
          {tab === 'code' && (
            <button type="button" onClick={copyBlocksToCode} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-soft hover:bg-surface-2 hover:text-ink" title="Sinh code từ chương trình khối">
              <Wand2 className="h-3.5 w-3.5" /> Lấy từ khối
            </button>
          )}
          {onLoadSample && tab !== 'arduino' && (
            <button type="button" onClick={onLoadSample} className="rounded px-2 py-1 text-xs text-ink-soft hover:bg-surface-2 hover:text-ink">
              Nạp mẫu PID
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {tab === 'blocks' && (
          <BlocklyEditor
            className="absolute inset-0"
            partNames={partNames}
            design={design}
            value={blockly}
            onChange={(json) => setBlockly(json)}
          />
        )}
        {tab === 'code' && (
          <div className="absolute inset-0 flex flex-col">
            <CodeEditor value={code} onChange={setCode} partNames={partNames} error={error} className="min-h-0 flex-1" />
          </div>
        )}
        {tab === 'arduino' && (
          <div className="absolute inset-0 overflow-auto p-2">
            <ArduinoCodeView blocks={blockly} design={design} fileName="probike" />
          </div>
        )}
      </div>
    </div>
  );
}
