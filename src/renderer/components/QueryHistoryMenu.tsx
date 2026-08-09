import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';
import { showInput, showConfirm } from '../dialog';
import {
  loadQueries, saveQueries, recordRun, setName, removeQuery, forScope, scopeKey,
  type QueryEntry, type QueryKind,
} from '../utils/queryHistory';

export interface QueryHistory {
  saved: QueryEntry[];
  recent: QueryEntry[];
  /** Call it right before (or after) a run — identical bodies are deduped. */
  record: (body: string, label: string) => QueryEntry;
  rename: (entry: QueryEntry) => Promise<void>;
  unsave: (entry: QueryEntry) => void;
  remove: (entry: QueryEntry) => Promise<void>;
}

/**
 * History for one runner on one collection.
 *
 * Every mutation re-reads localStorage before writing: `MainContent` keeps a
 * view mounted per tab, so two tabs on the same collection each hold their own
 * copy of this state and a blind write from one would drop the other's runs.
 */
export function useQueryHistory(kind: QueryKind, connectionId: string, database: string, collection: string): QueryHistory {
  const scope = scopeKey(connectionId, database, collection);
  const [entries, setEntries] = useState<QueryEntry[]>(loadQueries);

  const commit = useCallback((next: QueryEntry[]) => { saveQueries(next); setEntries(next); }, []);

  const record = useCallback((body: string, label: string) => {
    const next = recordRun(loadQueries(), { kind, scope, body, label });
    commit(next);
    // Return the stored entry, not the input: a re-run reuses the existing id,
    // which is what "Save current" then needs to name.
    return next.find(e => e.kind === kind && e.scope === scope && e.body === body)!;
  }, [kind, scope, commit]);

  const rename = useCallback(async (entry: QueryEntry) => {
    const name = await showInput({
      title: entry.name ? 'Rename query' : 'Save query',
      message: 'Name',
      placeholder: 'e.g. Active users, last 30 days',
      defaultValue: entry.name ?? '',
    });
    if (name === null) return;
    const trimmed = name.trim();
    commit(setName(loadQueries(), entry.id, trimmed || null));
  }, [commit]);

  const unsave = useCallback((entry: QueryEntry) => {
    commit(setName(loadQueries(), entry.id, null));
  }, [commit]);

  const remove = useCallback(async (entry: QueryEntry) => {
    if (entry.name && !await showConfirm({
      message: `Delete saved query "${entry.name}"?`, danger: true, confirmText: 'Delete',
    })) return;
    commit(removeQuery(loadQueries(), entry.id));
  }, [commit]);

  const { saved, recent } = forScope(entries, kind, scope);
  return { saved, recent, record, rename, unsave, remove };
}

function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

interface Props {
  history: QueryHistory;
  onPick: (entry: QueryEntry) => void;
  /** What is in the editor right now, so it can be saved without running it. */
  current?: () => { body: string; label: string };
}

export default function QueryHistoryMenu({ history, onPick, current }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { saved, recent } = history;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const now = Date.now();

  const row = (entry: QueryEntry) => (
    <div key={entry.id} className="qh-row">
      <button
        className="qh-pick"
        title={entry.label}
        onClick={() => { onPick(entry); setOpen(false); }}
      >
        <span className="qh-main">{entry.name ?? entry.label}</span>
        <span className="qh-sub">{entry.name ? entry.label : relTime(entry.at, now)}</span>
      </button>
      <button
        className={`icon-btn qh-act${entry.name ? ' active' : ''}`}
        title={entry.name ? 'Rename' : 'Save with a name'}
        onClick={() => history.rename(entry)}
      ><Icon name="pin" size={12} /></button>
      {entry.name && (
        <button className="icon-btn qh-act" title="Unsave (back to history)" onClick={() => history.unsave(entry)}>
          <Icon name="arrowDown" size={12} />
        </button>
      )}
      <button className="icon-btn qh-act" title="Delete" onClick={() => history.remove(entry)}>
        <Icon name="trash" size={12} />
      </button>
    </div>
  );

  return (
    <div className="qh-wrap" ref={wrapRef}>
      <button
        className={`secondary${open ? ' active-secondary' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Query history and saved queries"
      >
        <span className="toolbar-label">
          <Icon name="history" size={13} /> History{saved.length > 0 ? ` (${saved.length}★)` : ''}
        </span>
      </button>
      {open && (
        <div className="qh-menu">
          {current && (
            <button
              className="secondary btn-xs qh-save-current"
              onClick={async () => {
                const { body, label } = current();
                // Saving something never run yet has to create the entry first.
                await history.rename(history.record(body, label));
              }}
            ><Icon name="save" size={12} /> Save current</button>
          )}
          {saved.length > 0 && (
            <>
              <div className="qh-section">Saved</div>
              {saved.map(row)}
            </>
          )}
          <div className="qh-section">Recent</div>
          {recent.length === 0 && <div className="qh-empty">Nothing run yet on this collection</div>}
          {recent.map(row)}
        </div>
      )}
    </div>
  );
}
