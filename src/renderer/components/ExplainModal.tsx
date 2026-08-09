import { useState, useEffect, useMemo } from 'react';
import Icon, { IconName } from './Icon';
import { onEscape } from '../utils/keys';
import { showToast } from '../toast';
import { summarizeExplain, type ExplainLevel } from '../utils/explain';

const LEVEL_ICON: Record<ExplainLevel, IconName> = {
  good: 'check',
  warn: 'warn',
  bad: 'warn',
  unknown: 'info',
};

const count = (n: number | null) => (n === null ? '—' : n.toLocaleString());

interface Props {
  /** What was explained, for the header: `filter`, `query`, `pipeline`. */
  what: string;
  /** `db.collection`, so a modal opened from two tabs is still identifiable. */
  namespace: string;
  /** The IPC call. Made once, on mount — see the effect. */
  load: () => Promise<any>;
  onClose: () => void;
}

/**
 * What the server did with a query: which index, how many documents it had to
 * read to answer, and how long it took.
 *
 * The verdict comes first and the raw output last: the numbers only matter once
 * you know whether they are bad, and the raw explain is there for the cases the
 * summary cannot speak to (it is also the thing worth pasting into a ticket).
 */
export default function ExplainModal({ what, namespace, load, onClose }: Props) {
  const [raw, setRaw] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => onEscape(onClose), [onClose]);

  // Once, deliberately: `load` closes over the caller's current filter/query,
  // and putting it in the deps would re-explain on every parent render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await load();
        if (!cancelled) setRaw(res);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => (raw === null ? null : summarizeExplain(raw)), [raw]);

  const copyRaw = () => {
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    showToast({ message: 'Raw explain output copied', kind: 'success' });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <h3>Explain {what} · {namespace}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body explain-body">
          {loading && <div className="pane-empty">Explaining…</div>}
          {error && <div className="pane-error">{error}</div>}

          {summary && (
            <>
              <div className={`explain-verdict explain-verdict--${summary.level}`}>
                <Icon name={LEVEL_ICON[summary.level]} size={15} />
                <span>{summary.verdict}</span>
              </div>

              <div className="explain-metrics">
                <div className="explain-metric">
                  <span className="explain-metric-value">{count(summary.nReturned)}</span>
                  <span className="explain-metric-label">returned</span>
                </div>
                <div className="explain-metric">
                  <span className="explain-metric-value">{count(summary.totalDocsExamined)}</span>
                  <span className="explain-metric-label">documents examined</span>
                </div>
                <div className="explain-metric">
                  <span className="explain-metric-value">{count(summary.totalKeysExamined)}</span>
                  <span className="explain-metric-label">index keys examined</span>
                </div>
                <div className="explain-metric">
                  <span className="explain-metric-value">
                    {summary.executionTimeMillis === null ? '—' : `${count(summary.executionTimeMillis)} ms`}
                  </span>
                  <span className="explain-metric-label">execution time</span>
                </div>
              </div>

              <div className="explain-section-title">Winning plan</div>
              {summary.stages.length === 0
                ? <div className="pane-empty">No plan stages in the output</div>
                : (
                  <ol className="explain-plan">
                    {summary.stages.map((stage, i) => (
                      <li
                        key={`${stage.name}-${i}`}
                        className="explain-stage"
                        style={{ marginLeft: stage.depth * 14 }}
                      >
                        <span className="explain-stage-name">{stage.name}</span>
                        {/* Same glyph the Indexes tab uses, so "which index" reads the same everywhere. */}
                        {stage.index && (
                          <span className="explain-stage-index" title={stage.keyPattern}>
                            <Icon name="tabs" size={11} /> {stage.index}
                          </span>
                        )}
                        {stage.keyPattern && <span className="explain-stage-key">{stage.keyPattern}</span>}
                        <span className="explain-stage-meta">
                          {stage.nReturned !== undefined && `${stage.nReturned.toLocaleString()} out`}
                          {stage.ms !== undefined && ` · ~${stage.ms.toLocaleString()} ms`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

              <div className="explain-raw-head">
                <button className="secondary btn-xs" onClick={() => setShowRaw(v => !v)}>
                  <Icon name={showRaw ? 'chevronDown' : 'chevronRight'} size={11} /> Raw explain output
                </button>
                <button className="secondary btn-xs" onClick={copyRaw}>
                  <Icon name="copy" size={11} /> Copy
                </button>
              </div>
              {showRaw && <pre className="explain-raw">{JSON.stringify(raw, null, 2)}</pre>}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
