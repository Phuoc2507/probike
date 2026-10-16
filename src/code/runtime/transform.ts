// Chèn "chốt canh" (guard) vào mọi vòng lặp của code thí sinh để watchdog dừng được vòng lặp vô hạn.
// Không dùng parser đầy đủ: tách token đơn giản (bỏ qua chuỗi, comment, regex, template) rồi chèn
// lời gọi guard vào điều kiện của while/for, hoặc đầu thân for-in/for-of.
// Chỉ CHÈN chữ, không thêm dòng mới → số dòng báo lỗi giữ nguyên.

export const GUARD_NAME = '__pb_guard';

type TokType = 'word' | 'punct' | 'string' | 'regex' | 'comment' | 'ws' | 'number';
interface Token { type: TokType; start: number; end: number; value: string }

const REGEX_PREV_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

function isIdStart(c: string): boolean {
  return /[A-Za-z_$À-￿]/.test(c);
}
function isIdPart(c: string): boolean {
  return /[A-Za-z0-9_$À-￿]/.test(c);
}

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = src.length;
  let lastSig: Token | null = null;
  const push = (type: TokType, start: number, end: number) => {
    const t: Token = { type, start, end, value: src.slice(start, end) };
    toks.push(t);
    if (type !== 'ws' && type !== 'comment') lastSig = t;
  };
  const regexAllowed = (): boolean => {
    const p = lastSig as Token | null;
    if (!p) return true;
    if (p.type === 'punct') return !(p.value === ')' || p.value === ']' || p.value === '}');
    if (p.type === 'word') return REGEX_PREV_WORDS.has(p.value);
    return false;
  };

  while (i < n) {
    const c = src[i];
    const start = i;
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(src[i])) i++;
      push('ws', start, i);
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      push('comment', start, i);
    } else if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      push('comment', start, i);
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i = Math.min(n, i + 1);
      push('string', start, i);
    } else if (c === '`') {
      i++;
      let depth = 0;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (depth === 0 && ch === '`') break;
        if (ch === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && ch === '{') depth++;
        if (depth > 0 && ch === '}') depth--;
        i++;
      }
      i = Math.min(n, i + 1);
      push('string', start, i);
    } else if (c === '/' && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n && src[i] !== '\n') {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        i++;
      }
      i = Math.min(n, i + 1);
      while (i < n && /[a-z]/i.test(src[i])) i++;
      push('regex', start, i);
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < n && /[0-9A-Za-z_.]/.test(src[i])) i++;
      push('number', start, i);
    } else if (isIdStart(c)) {
      while (i < n && isIdPart(src[i])) i++;
      push('word', start, i);
    } else {
      i++;
      push('punct', start, i);
    }
  }
  return toks;
}

/** Trả về source đã chèn guard vào các vòng lặp. */
export function instrumentLoops(src: string, guard = GUARD_NAME): string {
  const all = tokenize(src);
  const sig = all.filter((t) => t.type !== 'ws' && t.type !== 'comment');
  const inserts: { pos: number; text: string }[] = [];

  const matchParen = (openIdx: number): number => {
    let depth = 0;
    for (let k = openIdx; k < sig.length; k++) {
      const v = sig[k].type === 'punct' ? sig[k].value : '';
      if (v === '(') depth++;
      else if (v === ')') {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  };

  for (let k = 0; k < sig.length; k++) {
    const t = sig[k];
    if (t.type !== 'word' || (t.value !== 'while' && t.value !== 'for')) continue;
    const prev = sig[k - 1];
    if (prev && prev.type === 'punct' && prev.value === '.') continue; // obj.while
    const open = sig[k + 1];
    if (!open || open.value !== '(') continue; // "for await" hoặc lỗi cú pháp: bỏ qua
    const close = matchParen(k + 1);
    if (close < 0) continue;

    if (t.value === 'while') {
      inserts.push({ pos: open.end, text: `${guard}() && (` });
      inserts.push({ pos: sig[close].start, text: ')' });
      continue;
    }

    // for: tìm 2 dấu ; ở mức ngoài cùng trong ngoặc
    const semis: number[] = [];
    let depth = 0;
    for (let m = k + 2; m < close; m++) {
      const v = sig[m].type === 'punct' ? sig[m].value : '';
      if (v === '(' || v === '[' || v === '{') depth++;
      else if (v === ')' || v === ']' || v === '}') depth--;
      else if (v === ';' && depth === 0) semis.push(m);
    }
    if (semis.length >= 2) {
      const a = sig[semis[0]];
      const b = sig[semis[1]];
      if (semis[1] === semis[0] + 1) {
        inserts.push({ pos: a.end, text: `${guard}()` });
      } else {
        inserts.push({ pos: a.end, text: `${guard}() && (` });
        inserts.push({ pos: b.start, text: ')' });
      }
    } else {
      // for (x of y) / for (k in o): chỉ chèn được khi thân là khối { }
      const body = sig[close + 1];
      if (body && body.value === '{') inserts.push({ pos: body.end, text: `${guard}();` });
    }
  }

  inserts.sort((x, y) => y.pos - x.pos);
  let out = src;
  for (const ins of inserts) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  return out;
}
