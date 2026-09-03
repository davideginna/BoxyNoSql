import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
// The `editor.api` entry point is deliberately minimal — folding is a "contrib"
// module and is not registered without this import. Without it
// `getContribution('editor.contrib.folding')` is null and `folding`/
// `showFoldingControls` are silently no-ops: no gutter arrows, ever.
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import type { MonacoThemeName } from './MonacoQueryEditor';

// The document/add-document JSON boxes are a single free-form value, not a
// `db.` chain or a pipeline stage — no operator completions needed. Validation
// is off, not just schema noise: a document round-trips through `prettyDoc`
// as shell-style `ObjectId("…")` / `ISODate("…")`, which isn't valid JSON, so
// Monaco's own validator would red-squiggle every _id. The app already shows
// its own validity status (`validateJson`/`jsonValid`, dialect-aware) next to
// the editor — Monaco's diagnostics would only ever be redundant or wrong.
// `jsonDefaults` is one global shared with MonacoQueryEditor's stage-body
// editor, so this must match what that file sets, or whichever mounts last
// wins and silently flips the other's validation live.
let diagnosticsConfigured = false;
function ensureJsonDiagnostics() {
  if (diagnosticsConfigured) return;
  diagnosticsConfigured = true;
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: false,
    allowComments: false,
    schemas: [],
    enableSchemaRequest: false,
  });
}

export interface MonacoJsonEditorHandle {
  focus: () => void;
  /** Select a range by plain character offset into the current value (e.g. a
   *  find-in-document match) and scroll it into view. */
  selectOffsetRange: (start: number, end: number) => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  lineNumbers: boolean;
  wrap?: boolean;
  theme?: MonacoThemeName;
  className?: string;
  /** Ctrl+Enter / Alt+Enter. */
  onSave?: () => void;
  /** Ctrl+F — overrides Monaco's own find widget so the modal's own find bar
   *  (with its cross-editor match count) opens instead. Omit to let Monaco's
   *  default find handle it (the add-document modal has no find bar). */
  onFindShortcut?: () => void;
}

/**
 * Monaco, `language="json"`, for a single free-standing document — the
 * add-document and edit-document modals in DocumentsView. Folding comes for
 * free from Monaco; the old hand-rolled `<pre>`+`<textarea>` editor it
 * replaced had no parse tree to fold against.
 */
const MonacoJsonEditor = forwardRef<MonacoJsonEditorHandle, Props>(function MonacoJsonEditor({
  value, onChange, lineNumbers, wrap = false, theme = 'vs-dark', className = '', onSave, onFindShortcut,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onFindRef = useRef(onFindShortcut);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onFindRef.current = onFindShortcut;

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    selectOffsetRange: (start, end) => {
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (!ed || !model) return;
      const range = monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
      ed.setSelection(range);
      ed.revealRangeInCenter(range);
      ed.focus();
    },
  }), []);

  useEffect(() => {
    ensureJsonDiagnostics();
    if (!hostRef.current) return;
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language: 'json',
      theme,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      wordWrap: wrap ? 'on' : 'off',
      lineNumbers: lineNumbers ? 'on' : 'off',
      folding: true,
      // Default is 'mouseover' — the arrows only appear while hovering the
      // exact gutter row. 'always' keeps them visible without hunting for them.
      showFoldingControls: 'always',
      lineDecorationsWidth: lineNumbers ? undefined : 4,
      lineNumbersMinChars: lineNumbers ? 3 : 0,
      padding: { top: 8, bottom: 8 },
    });
    editorRef.current = editor;

    const sub = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onSaveRef.current?.());
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => onSaveRef.current?.());
    // Only steal Ctrl+F from Monaco when the caller has its own find bar to
    // open — otherwise leave Monaco's default find widget alone.
    if (onFindShortcut) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => onFindRef.current?.());
    }

    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value sync (Format button, history/paste, tab-level updates).
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (ed.getValue() !== value) ed.setValue(value);
  }, [value]);

  // Line-numbers / wrap toggles.
  useEffect(() => {
    editorRef.current?.updateOptions({
      lineNumbers: lineNumbers ? 'on' : 'off',
      lineDecorationsWidth: lineNumbers ? undefined : 4,
      lineNumbersMinChars: lineNumbers ? 3 : 0,
    });
  }, [lineNumbers]);
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  }, [wrap]);

  useEffect(() => { monaco.editor.setTheme(theme); }, [theme]);

  return (
    <div className={`json-editor-wrap${className ? ' ' + className : ''}`}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default MonacoJsonEditor;
