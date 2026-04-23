import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';

// Register completions once per process
let completionsRegistered = false;

const COLLECTION_METHODS: { name: string; snippet: string; doc: string }[] = [
  { name: 'find',              snippet: 'find(${1:{}})',                                     doc: 'Cursor for matching documents.' },
  { name: 'findOne',           snippet: 'findOne(${1:{}})',                                  doc: 'First matching document or null.' },
  { name: 'insertOne',         snippet: 'insertOne(${1:{}})',                                doc: 'Insert a single document.' },
  { name: 'insertMany',        snippet: 'insertMany([${1:{}}])',                             doc: 'Insert multiple documents.' },
  { name: 'updateOne',         snippet: 'updateOne(${1:{}}, { $$set: ${2:{}} })',            doc: 'Update first matching document.' },
  { name: 'updateMany',        snippet: 'updateMany(${1:{}}, { $$set: ${2:{}} })',           doc: 'Update all matching documents.' },
  { name: 'replaceOne',        snippet: 'replaceOne(${1:{}}, ${2:{}})',                      doc: 'Replace first matching document.' },
  { name: 'deleteOne',         snippet: 'deleteOne(${1:{}})',                                doc: 'Delete first matching document.' },
  { name: 'deleteMany',        snippet: 'deleteMany(${1:{}})',                               doc: 'Delete all matching documents.' },
  { name: 'countDocuments',    snippet: 'countDocuments(${1:{}})',                           doc: 'Count matching documents.' },
  { name: 'estimatedDocumentCount', snippet: 'estimatedDocumentCount()',                     doc: 'Fast metadata count.' },
  { name: 'distinct',          snippet: 'distinct("${1:field}", ${2:{}})',                   doc: 'Distinct values of a field.' },
  { name: 'aggregate',         snippet: 'aggregate([\n  { $$match: ${1:{}} }\n])',           doc: 'Run an aggregation pipeline.' },
  { name: 'createIndex',       snippet: 'createIndex({ ${1:field}: ${2:1} })',               doc: 'Create an index.' },
  { name: 'dropIndex',         snippet: 'dropIndex("${1:indexName}")',                       doc: 'Drop an index by name.' },
  { name: 'indexes',           snippet: 'indexes()',                                         doc: 'List collection indexes.' },
];

const CURSOR_METHODS: { name: string; snippet: string; doc: string }[] = [
  { name: 'limit',    snippet: 'limit(${1:100})',              doc: 'Max number of docs returned.' },
  { name: 'skip',     snippet: 'skip(${1:0})',                 doc: 'Skip N docs.' },
  { name: 'sort',     snippet: 'sort({ ${1:field}: ${2:1} })', doc: 'Sort cursor results.' },
  { name: 'project',  snippet: 'project({ ${1:field}: 1 })',   doc: 'Project specific fields.' },
  { name: 'toArray',  snippet: 'toArray()',                    doc: 'Materialize cursor to array.' },
  { name: 'count',    snippet: 'count()',                      doc: 'Count cursor results (deprecated).' },
];

const OPERATORS: string[] = [
  '$eq','$ne','$gt','$gte','$lt','$lte','$in','$nin','$exists','$type','$regex','$options',
  '$and','$or','$nor','$not',
  '$set','$unset','$inc','$push','$pull','$addToSet','$rename',
  '$match','$project','$group','$sort','$limit','$skip','$unwind','$lookup','$addFields','$facet','$count',
];

function registerCompletions() {
  if (completionsRegistered) return;
  completionsRegistered = true;

  monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['.', '$', '"', "'", '('],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const lineUntil = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });

      const suggestions: monaco.languages.CompletionItem[] = [];

      // After `db.collection("x").` or `db.<something>.`
      if (/\.\w*$/.test(lineUntil)) {
        COLLECTION_METHODS.forEach(m => suggestions.push({
          label: m.name,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: m.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: m.doc,
          range,
        }));
        CURSOR_METHODS.forEach(m => suggestions.push({
          label: m.name,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: m.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: m.doc,
          range,
        }));
      }

      // $ operators anywhere
      if (/\$\w*$/.test(lineUntil) || /["{,\s]\$\w*$/.test(lineUntil)) {
        OPERATORS.forEach(op => suggestions.push({
          label: op,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: op,
          documentation: `MongoDB operator ${op}`,
          range,
        }));
      }

      // Top-level `db` hint
      suggestions.push({
        label: 'db',
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: 'db',
        documentation: 'Current database handle.',
        range,
      });
      suggestions.push({
        label: 'db.collection',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'db.collection("${1:name}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: 'Get a collection handle.',
        range,
      });

      return { suggestions };
    },
  });

  // Silence the diagnostics about undeclared `db`, await at top-level, etc.
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
  });
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  theme?: 'vs-dark' | 'vs' | 'hc-black';
  collectionSample?: string[];
}

export default function MonacoQueryEditor({ value, onChange, onRun, theme = 'vs-dark', collectionSample }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    registerCompletions();
    if (!hostRef.current) return;
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language: 'javascript',
      theme,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      lineNumbers: 'on',
    });
    editorRef.current = editor;

    const sub = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    // Ctrl+Enter → run (use latest onRun via ref)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.();
    });
    // Ctrl+Space → trigger suggestion
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    });
    // Also bind at the DOM level as fallback — Monaco sometimes misses KeyCode.Space
    const host = hostRef.current;
    const keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        editor.focus();
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onRunRef.current?.();
      }
    };
    host.addEventListener('keydown', keyHandler, true);

    return () => {
      host.removeEventListener('keydown', keyHandler, true);
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value sync (tab switch)
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (ed.getValue() !== value) ed.setValue(value);
  }, [value]);

  // Theme update
  useEffect(() => { monaco.editor.setTheme(theme); }, [theme]);

  // Sample-field completions (per-collection)
  useEffect(() => {
    if (!collectionSample || collectionSample.length === 0) return;
    const disposable = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['"', "'"],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          suggestions: collectionSample.map(f => ({
            label: f,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: f,
            documentation: 'Field from sample document',
            range,
          })),
        };
      },
    });
    return () => disposable.dispose();
  }, [collectionSample?.join('|')]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}
