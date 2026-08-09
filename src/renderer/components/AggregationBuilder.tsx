import { useState, useEffect } from 'react';
import QueryHistoryMenu, { useQueryHistory } from './QueryHistoryMenu';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import MonacoQueryEditor, { MonacoThemeName } from './MonacoQueryEditor';
import ExplainModal from './ExplainModal';
import Icon from './Icon';
import { showAlert } from '../dialog';
import { onRunKey } from '../utils/keys';

const STAGES = [
  '$match', '$project', '$group', '$sort', '$limit', '$skip',
  '$unwind', '$lookup', '$addFields', '$set', '$unset', '$replaceRoot',
  '$facet', '$count', '$sortByCount', '$bucket', '$sample', '$geoNear',
  '$graphLookup', '$merge', '$out',
];

/** A body that makes sense for the stage, instead of `{}` for all of them. */
const STAGE_TEMPLATES: Record<string, string> = {
  $match: '{\n  \n}',
  $project: '{\n  "_id": 0\n}',
  $group: '{\n  "_id": "$field",\n  "count": { "$sum": 1 }\n}',
  $sort: '{\n  "field": -1\n}',
  $limit: '10',
  $skip: '0',
  $unwind: '"$field"',
  $count: '"total"',
  $sample: '{\n  "size": 10\n}',
  $sortByCount: '"$field"',
};

const templateFor = (stage: string) => STAGE_TEMPLATES[stage] ?? '{\n  \n}';

interface Stage { stage: string; value: string }

interface AggregationBuilderProps {
  connectionId: string;
  database: string;
  collection: string;
  /** False for a tab that is mounted but not on screen — see `MainContent`. */
  active?: boolean;
  result: any[];
  setResult: (result: any[]) => void;
}

/** The stage as Mongo wants it, or an error for the box that produced it. */
function parseStage(s: Stage): { ok: true; stage: any } | { ok: false; error: string } {
  try {
    return { ok: true, stage: { [s.stage]: JSON.parse(s.value || '{}') } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export default function AggregationBuilder({ connectionId, database, collection, result, setResult, active = true }: AggregationBuilderProps) {
  const [stages, setStages] = useState<Stage[]>([{ stage: '$match', value: templateFor('$match') }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Documents left after each stage, from the last run. `null` = not countable. */
  const [counts, setCounts] = useState<(number | null)[]>([]);
  const [sampleFields, setSampleFields] = useState<string[]>([]);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  const history = useQueryHistory('aggregation', connectionId, database, collection);

  // Same detection as QueryTerminal: App re-renders this tree on theme change.
  const theme: MonacoThemeName =
    document.body.classList.contains('theme-light') ? 'vs'
    : document.body.classList.contains('theme-hc') ? 'hc-black'
    : document.body.classList.contains('theme-solarized') ? 'boxy-solarized'
    : 'vs-dark';

  // Field names for the completions inside a stage body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const docs = await (window as any).electron.invoke('get-documents', connectionId, database, collection, {}, 20, 0);
        if (cancelled) return;
        const fields = new Set<string>();
        (docs.docs || []).forEach((d: any) => Object.keys(d).forEach(k => fields.add(k)));
        setSampleFields(Array.from(fields));
      } catch { /* completions are a nicety, not a requirement */ }
    })();
    return () => { cancelled = true; };
  }, [connectionId, database, collection]);

  // Any edit invalidates the counters — they belong to the pipeline that ran.
  const editStages = (next: Stage[]) => { setStages(next); setCounts([]); };

  const addStage = () => editStages([...stages, { stage: '$match', value: templateFor('$match') }]);
  const removeStage = (index: number) => editStages(stages.filter((_, i) => i !== index));
  const moveStage = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    editStages(next);
  };
  const updateStage = (index: number, changes: Partial<Stage>) => {
    const next = [...stages];
    // Switching the stage type replaces an untouched body with the new
    // template, but never overwrites something that was actually written.
    if (changes.stage && next[index].value.trim() === templateFor(next[index].stage).trim()) {
      changes = { ...changes, value: templateFor(changes.stage) };
    }
    next[index] = { ...next[index], ...changes };
    editStages(next);
  };

  // The stages as typed, not the parsed pipeline: a stage with broken JSON has
  // to come back out of the history exactly as it went in.
  const stagesBody = () => JSON.stringify(stages);
  const stagesLabel = () => stages.map(s => s.stage).join(' → ') || '(empty pipeline)';

  const exportRows = async (format: 'json' | 'ndjson' | 'csv') => {
    try {
      const res = await (window as any).electron.invoke('export-rows', {
        rows: result, baseName: `${collection}-aggregation`, format,
      });
      if (res.canceled) return;
      await showAlert({ title: 'Export complete', message: `${res.count} row${res.count === 1 ? '' : 's'} written.`, detail: res.filePath });
    } catch (err: any) { setError(err.message); }
  };

  const exportItems = (): ContextMenuEntry[] => (['json', 'ndjson', 'csv'] as const).map(f => ({
    label: f.toUpperCase(), icon: 'download' as const, onClick: () => exportRows(f),
  }));

  const parsed = stages.map(parseStage);
  const firstBroken = parsed.findIndex(p => !p.ok);

  const handleRun = async () => {
    if (firstBroken !== -1) {
      const broken = parsed[firstBroken] as { ok: false; error: string };
      setError(`Stage ${firstBroken + 1} (${stages[firstBroken].stage}): ${broken.error}`);
      return;
    }
    setLoading(true);
    setError(null);
    history.record(stagesBody(), stagesLabel());
    const pipeline = parsed.map(p => (p as { ok: true; stage: any }).stage);
    try {
      const res = await (window as any).electron.invoke('run-aggregation', connectionId, database, collection, pipeline);
      setResult(res);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return;
    }
    // Counters are a second, best-effort round trip: one aggregation per stage,
    // so a failure here must not throw away the result that already came back.
    try {
      setCounts(await (window as any).electron.invoke('aggregation-stage-counts', connectionId, database, collection, pipeline));
    } catch { setCounts([]); }
    setLoading(false);
  };

  useEffect(() => {
    if (!active || showExplain) return;
    return onRunKey(e => { e.preventDefault(); handleRun(); });
  }, [active, showExplain, stages, connectionId, database, collection]);

  return (
    <div className="aggregation-builder">
      {exportMenu && (
        <ContextMenu x={exportMenu.x} y={exportMenu.y} items={exportItems()} onClose={() => setExportMenu(null)} />
      )}
      {showExplain && (
        <ExplainModal
          what="pipeline"
          namespace={`${database}.${collection}`}
          load={() => (window as any).electron.invoke(
            'explain-aggregation', connectionId, database, collection,
            parsed.map(p => (p as { ok: true; stage: any }).stage),
          )}
          onClose={() => setShowExplain(false)}
        />
      )}
      <div className="toolbar">
        <button onClick={addStage}><Icon name="plus" size={13} /> Add Stage</button>
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Running…' : <><Icon name="play" size={12} /> Run Pipeline</>}
        </button>
        <button
          className="secondary"
          disabled={firstBroken !== -1}
          title={firstBroken !== -1
            ? `Stage ${firstBroken + 1} has invalid JSON`
            : 'Explain this pipeline — index usage, documents examined, stage timings'}
          onClick={() => setShowExplain(true)}
        >
          <Icon name="plan" size={13} /> Explain
        </button>
        <button
          className="secondary"
          disabled={result.length === 0}
          title={result.length === 0 ? 'Run the pipeline first' : 'Export these results'}
          onClick={e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setExportMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <Icon name="download" size={13} /> Export
        </button>
        <QueryHistoryMenu
          history={history}
          onPick={e => { try { editStages(JSON.parse(e.body)); } catch { /* keep what is there */ } }}
          current={() => ({ body: stagesBody(), label: stagesLabel() })}
        />
        <span className="qt-hint">
          <kbd className="kbd">Ctrl+Space</kbd> suggestions · <kbd className="kbd">Alt+Enter</kbd> run
        </span>
        <span className="qt-meta">
          {result.length > 0 && `${result.length} result${result.length !== 1 ? 's' : ''} · `}{database}.{collection}
        </span>
      </div>
      <div className="agg-split">
        <div className="pipeline-stages agg-stages">
          {stages.map((stage, index) => {
            const p = parsed[index];
            const count = counts[index];
            return (
              <div key={index} className={`pipeline-stage${p.ok ? '' : ' stage-invalid'}`}>
                <div className="pipeline-stage-header">
                  <span className="agg-stage-num">{index + 1}</span>
                  <select
                    className="agg-stage-select"
                    value={stage.stage}
                    onChange={e => updateStage(index, { stage: e.target.value })}
                  >
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {counts.length > 0 && (
                    <span className="agg-stage-count" title="Documents leaving this stage on the last run">
                      {count === null || count === undefined ? '—' : `${count.toLocaleString()} docs`}
                    </span>
                  )}
                  <div className="agg-stage-actions">
                    <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => moveStage(index, -1)}>
                      <Icon name="arrowUp" size={12} />
                    </button>
                    <button className="icon-btn" title="Move down" disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)}>
                      <Icon name="arrowDown" size={12} />
                    </button>
                    <button className="icon-btn" title="Remove stage" onClick={() => removeStage(index)}>
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                </div>
                <div className="agg-stage-editor">
                  <MonacoQueryEditor
                    value={stage.value}
                    onChange={v => updateStage(index, { value: v })}
                    onRun={handleRun}
                    theme={theme}
                    collectionSample={sampleFields}
                    language="json"
                    lineNumbers={false}
                  />
                </div>
                {!p.ok && <div className="agg-stage-error">{p.error}</div>}
              </div>
            );
          })}
          {stages.length === 0 && <div className="pane-empty">No stages — add one to start</div>}
        </div>
        <div className="agg-results">
          {error && <div className="pane-error">Error: {error}</div>}
          {!error && result.length === 0 && !loading && <div className="pane-empty">No results</div>}
          {result.length > 0 && (
            <div className="document-table">
              <table>
                <thead>
                  <tr>
                    {Object.keys(result[0]).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.map((doc, idx) => (
                    <tr key={idx}>
                      {Object.keys(result[0]).map(key => (
                        <td key={key} style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
                          {typeof doc[key] === 'object' ? JSON.stringify(doc[key]) : String(doc[key] ?? 'null')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
