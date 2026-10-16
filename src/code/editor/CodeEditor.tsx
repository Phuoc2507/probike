// Trình soạn code JavaScript (CodeMirror): tô màu, gợi ý API + tên linh kiện, đánh dấu dòng lỗi.

import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, {
  Decoration,
  EditorView,
  StateEffect,
  StateField,
  type DecorationSet,
  type Extension,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { probikeCompletionSource } from './completions';

export interface CodeError {
  message: string;
  line?: number;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Tên linh kiện để gợi ý trong read("…"), motor("…")... */
  partNames: string[];
  /** Lỗi hiện tại: dòng lỗi được tô đỏ, thông điệp hiện dưới editor. */
  error?: CodeError | null;
  readOnly?: boolean;
  height?: string;
  className?: string;
  /** Extension bổ sung (vd: y-codemirror để cộng tác). */
  extensions?: Extension[];
}

const NO_EXTENSIONS: Extension[] = [];

const setErrorLine = StateEffect.define<number | null>();

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue;
      const n = e.value;
      if (n === null || n < 1 || n > tr.state.doc.lines) {
        deco = Decoration.none;
      } else {
        const line = tr.state.doc.line(n);
        deco = Decoration.set([Decoration.line({ class: 'cm-probike-error-line' }).range(line.from)]);
      }
    }
    // Sửa code thì bỏ đánh dấu (lỗi có thể đã hết)
    if (tr.docChanged) deco = Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const errorTheme = EditorView.baseTheme({
  '.cm-probike-error-line': { backgroundColor: 'rgba(239, 68, 68, 0.18)', boxShadow: 'inset 3px 0 0 #ef4444' },
});

export default function CodeEditor({
  value, onChange, partNames, error, readOnly, height = '100%', className, extensions = NO_EXTENSIONS,
}: CodeEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const partsRef = useRef(partNames);
  partsRef.current = partNames;

  const exts = useMemo<Extension[]>(
    () => [
      javascript(),
      javascriptLanguage.data.of({ autocomplete: probikeCompletionSource(() => partsRef.current) }),
      errorLineField,
      errorTheme,
      EditorView.lineWrapping,
      ...extensions,
    ],
    [extensions],
  );

  const errorLine = error?.line ?? null;
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setErrorLine.of(errorLine)];
    if (errorLine && errorLine <= view.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(view.state.doc.line(errorLine).from, { y: 'center' }));
    }
    view.dispatch({ effects });
  }, [errorLine, error?.message]);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-line ${className ?? ''}`}>
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        height={height}
        readOnly={readOnly}
        extensions={exts}
        basicSetup={{ tabSize: 2, foldGutter: false }}
        className="min-h-0 flex-1 overflow-auto text-sm"
        onCreateEditor={(view) => {
          if (errorLine) view.dispatch({ effects: setErrorLine.of(errorLine) });
        }}
      />
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error.message}
        </div>
      )}
    </div>
  );
}
