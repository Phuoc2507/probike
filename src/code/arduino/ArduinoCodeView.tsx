// Xem code Arduino C++ sinh từ khối, có nút sao chép và tải file .ino.

import { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { VehicleDesign } from '@/shared/types';
import { blocksJsonToArduino } from './generator';

export interface ArduinoCodeViewProps {
  /** JSON workspace Blockly. */
  blocks: object | null;
  design?: VehicleDesign | null;
  /** Tên file khi tải về (không có đuôi). */
  fileName?: string;
  className?: string;
}

export default function ArduinoCodeView({ blocks, design, fileName = 'probike', className }: ArduinoCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const { code, error } = useMemo(() => {
    try {
      return { code: blocksJsonToArduino(blocks, { design }), error: '' };
    } catch (e) {
      return { code: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [blocks, design]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Trình duyệt chặn clipboard: chọn chữ để người dùng tự sao chép
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const safe = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '_') || 'probike';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-line bg-surface ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-ink">Code Arduino C++</div>
          <div className="text-xs text-ink-soft">Dán vào Arduino IDE. Kiểm tra lại các dòng có ⚠ (chân cắm, chiều quay).</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={!code}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!code}
            className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Download size={16} />
            Tải .ino
          </button>
        </div>
      </div>
      {error ? (
        <div className="p-3 text-sm text-red-600">Không xuất được code: {error}</div>
      ) : (
        <pre className="m-0 flex-1 overflow-auto bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">{code}</pre>
      )}
    </div>
  );
}
