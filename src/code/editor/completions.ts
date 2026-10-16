// Gợi ý code cho CodeMirror: API ProBike, phương thức imu./pid., tên linh kiện trong read("…")/motor("…")...

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { API_DOCS, IMU_METHODS, PART_NAME_FUNCTIONS, PID_METHODS } from '../api-docs';

const PART_CALL_RE = new RegExp(`\\b(${PART_NAME_FUNCTIONS.join('|')})\\(\\s*(["'\`])([^"'\`]*)$`);

const API_OPTIONS: Completion[] = API_DOCS.map((d) => ({
  label: d.name,
  type: d.kind === 'class' ? 'class' : d.kind === 'constant' ? 'constant' : d.kind === 'variable' ? 'variable' : 'function',
  detail: d.signature,
  info: d.detail,
  boost: 2,
}));

const methodOptions = (docs: typeof IMU_METHODS): Completion[] =>
  docs.map((d) => ({ label: d.name, type: 'method', detail: d.signature, info: d.detail, apply: d.name === 'update' || d.name === 'setLimits' || d.name === 'setTunings' ? d.name : `${d.name}()` }));

const IMU_OPTIONS = methodOptions(IMU_METHODS);
const PID_OPTIONS = methodOptions(PID_METHODS);

/** Tạo nguồn gợi ý; getPartNames được gọi mỗi lần gợi ý nên danh sách luôn mới. */
export function probikeCompletionSource(getPartNames: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.sliceDoc(line.from, context.pos);

    // 1) Tên linh kiện trong chuỗi: motor("ban|
    const part = before.match(PART_CALL_RE);
    if (part) {
      const typed = part[3];
      const names = getPartNames();
      if (!names.length) return null;
      return {
        from: context.pos - typed.length,
        options: names.map((n) => ({ label: n, type: 'variable', detail: 'linh kiện', boost: 5 })),
        validFor: /^[^"'`]*$/,
      };
    }

    // 2) imu.ro|
    const imu = before.match(/\bimu\.(\w*)$/);
    if (imu) return { from: context.pos - imu[1].length, options: IMU_OPTIONS, validFor: /^\w*$/ };

    // 3) pid.up| với pid khai báo bằng new PID(...)
    const member = before.match(/\b([A-Za-z_$][\w$]*)\.(\w*)$/);
    if (member) {
      const doc = context.state.doc.toString();
      const pidVars = new Set([...doc.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*new\s+PID\b/g)].map((m) => m[1]));
      if (pidVars.has(member[1])) return { from: context.pos - member[2].length, options: PID_OPTIONS, validFor: /^\w*$/ };
      return null;
    }

    // 4) Tên hàm API
    const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
    if (!word && !context.explicit) return null;
    return { from: word ? word.from : context.pos, options: API_OPTIONS, validFor: /^[\w$]*$/ };
  };
}
