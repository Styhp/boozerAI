import { useCallback, useEffect, useState } from 'react';
import type { DependencyGraph, FilePath } from '../../shared/contracts';
import type { NoteKind, NotesResponse, NoteStatus, NoteView } from '../../shared/notes';
import type { NotesSource } from '../data/project-source';
import { findFile, type Selection } from '../map/model';
import './NotesPanel.css';

// Project notes, phase 1. Notes are the user's own words, never verified facts and never
// sent to a model. Every string renders as React text (escaped). A linked range opens with
// highlighting only while its status is `current`; moved/stale lines are never highlighted.

export type NotesView =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly response: NotesResponse }
  | { readonly status: 'failed'; readonly code: string };

const KINDS: readonly { value: NoteKind; label: string }[] = [
  { value: 'decision', label: 'Decision' }, { value: 'constraint', label: 'Constraint' }, { value: 'question', label: 'Question' },
];
const kindLabel = (kind: NoteKind) => KINDS.find((entry) => entry.value === kind)?.label ?? kind;
const STATUS_LABELS: Readonly<Record<NoteStatus, string>> = {
  current: 'Current', moved: 'Moved', stale: 'Stale', missing: 'Missing', 'not-linked': 'Not linked',
};
const MAX_CHARS = 2_000;

function codeOf(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined;
  return typeof code === 'string' && /^[a-z-]{1,40}$/.test(code) ? code : 'request-failed';
}

const MESSAGES: Readonly<Record<string, string>> = {
  'revision-conflict': 'This note changed since it was loaded. The list was reloaded; try again.',
  'notes-overlap': "Notes can't be used for this folder because it overlaps Boozer's data folder. Nothing was written.",
  'notes-disabled': 'Notes are off for this folder.',
  'invalid-range': "Those lines aren't in this file, or the range is longer than 200 lines.",
  'invalid-file': 'That file is not in the current snapshot.',
  'note-too-long': 'A note can be at most 2,000 characters.',
  'note-limit': 'This folder already has 500 notes.',
  'store-full': 'The notes file for this folder is full.',
  'store-read-only': "Notes couldn't be read, so nothing was changed.",
  'stale-snapshot': 'The snapshot changed. Refresh to work with current notes.',
  'not-moved': 'The linked lines are no longer in exactly one new place, so the link was not updated.',
  'invalid-body': 'Check the note: it needs text, and line numbers must be whole numbers from 1.',
};
const messageFor = (code: string) => MESSAGES[code] ?? `The notes request failed (${code}). Nothing else was affected.`;

function NoteItem({ view, graph, busy, onSelect, onRun, notes }: {
  view: NoteView; graph: DependencyGraph; busy: boolean;
  onSelect: (selection: Selection) => void; onRun: (action: () => Promise<void>) => Promise<boolean>; notes: NotesSource;
}) {
  const { note, status } = view;
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [text, setText] = useState(note.text);
  const link = note.link;
  const file = link === null ? undefined : findFile(graph, link.file);
  const label = link === null ? null : `${link.file}:${link.startLine}–${link.endLine}`;

  return (
    <li className={`note status-${status}`} data-status={status} aria-label="Your note">
      <p className="note-meta">
        <span className="badge note-kind">{kindLabel(note.kind)}</span>{' '}
        <span className={`badge note-status status-${status}`}>{STATUS_LABELS[status]}</span>{' '}
        {link !== null && label !== null && (status === 'current' && file !== undefined
          ? <button type="button" className="link" onClick={() => onSelect({ kind: 'range', ref: {
            snapshotId: graph.snapshotId, file: link.file, startLine: link.startLine, endLine: link.endLine, contentHash: file.contentHash,
          } })}>{label}</button>
          : <code className="note-range">{label}</code>)}
      </p>
      {editing ? (
        <div className="note-form">
          <label htmlFor={`note-edit-kind-${note.id}`}>Kind</label>
          <select id={`note-edit-kind-${note.id}`} value={kind} onChange={(event) => setKind(event.target.value as NoteKind)}>
            {KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <label htmlFor={`note-edit-text-${note.id}`}>Your note</label>
          <textarea id={`note-edit-text-${note.id}`} value={text} maxLength={MAX_CHARS} rows={3} onChange={(event) => setText(event.target.value)} />
          <div className="note-actions">
            <button type="button" disabled={busy || text.trim() === ''} onClick={() => void onRun(() => notes.edit(note.id, {
              snapshotId: graph.snapshotId, revision: note.revision, text, kind,
            })).then((ok) => { if (ok) setEditing(false); })}>Save</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(false); setKind(note.kind); setText(note.text); }}>Cancel</button>
          </div>
        </div>
      ) : <p className="note-text">{note.text}</p>}
      {status === 'moved' && view.movedTo !== undefined && (
        <p className="notice warning">
          These exact lines are now at {view.movedTo.startLine}–{view.movedTo.endLine}. The link was not changed.{' '}
          <button type="button" disabled={busy} onClick={() => void onRun(() => notes.edit(note.id, {
            snapshotId: graph.snapshotId, revision: note.revision, relink: 'moved',
          }))}>Update link</button>
        </p>
      )}
      {status === 'stale' && link !== null && <>
        <p className="notice warning">The linked lines changed since this note was saved. Lines {link.startLine}–{link.endLine} now read:</p>
        <pre className="note-current">{view.currentText === undefined || view.currentText === '' ? '(no lines)' : view.currentText}</pre>
      </>}
      {status === 'missing' && <p className="notice warning">The linked file is not in this snapshot.</p>}
      {!editing && (
        <div className="note-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void onRun(() => notes.remove(note.id, note.revision))}>Delete</button>
        </div>
      )}
    </li>
  );
}

export function NotesPanel({ notes, graph, path, onSelect, initial }: {
  notes: NotesSource;
  graph: DependencyGraph;
  path: FilePath;
  onSelect: (selection: Selection) => void;
  // Tests render a fixed state; the app always loads from the server.
  initial?: NotesView;
}) {
  const [view, setView] = useState<NotesView>(initial ?? { status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [kind, setKind] = useState<NoteKind>('decision');
  const [text, setText] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('1');
  const [linked, setLinked] = useState(true);
  const snapshotId = graph.snapshotId;

  const reload = useCallback(async () => {
    try { setView({ status: 'loaded', response: await notes.list(snapshotId) }); }
    catch (error) { setView({ status: 'failed', code: codeOf(error) }); }
  }, [notes, snapshotId]);
  useEffect(() => { if (initial === undefined) void reload(); }, [reload, initial]);

  // Runs one change, then reloads so statuses come from the server, never from a guess here.
  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    let ok = true;
    try { await action(); } catch (error) { ok = false; setNotice(messageFor(codeOf(error))); }
    finally { setBusy(false); }
    await reload();
    return ok;
  }, [reload]);

  const heading = <h3 id="notes-heading">Your notes</h3>;
  const noticeLine = notice !== null && <p className="notice error" role="status">{notice}</p>;
  if (view.status === 'loading') return <section className="notes" aria-labelledby="notes-heading" data-state="loading">{heading}<p className="muted">Loading notes…</p></section>;
  if (view.status === 'failed') {
    return (
      <section className="notes" aria-labelledby="notes-heading" data-state="failed">{heading}
        <p className="notice error" role="status">Notes couldn't be loaded ({view.code}). Nothing was changed. The rest of Boozer works normally.</p>
      </section>
    );
  }
  const response = view.response;
  if (!response.enabled) {
    return (
      <section className="notes" aria-labelledby="notes-heading" data-state="off">{heading}
        <p>Notes are off for this folder.{' '}
          <button type="button" id="notes-enable" disabled={busy} onClick={() => void run(() => notes.enable())}>Remember notes for this folder</button>
        </p>
        <p className="muted small">Notes are saved on this computer, outside the project folder.</p>
        {noticeLine}
      </section>
    );
  }
  if (response.state === 'error') {
    return (
      <section className="notes" aria-labelledby="notes-heading" data-state="error">{heading}
        <p className="notice error" role="status">Notes couldn't be read ({response.errorCode ?? 'store-error'}). Nothing was changed. The rest of Boozer works normally.</p>
        {noticeLine}
      </section>
    );
  }

  const here = response.notes.filter((entry) => entry.note.link?.file === path);
  const unlinked = response.notes.filter((entry) => entry.note.link === null);
  const fromLine = Number(from);
  const toLine = Number(to);
  const save = () => run(() => notes.create({
    snapshotId, kind, text,
    ...(linked ? { link: { path, startLine: fromLine, endLine: toLine } } : {}),
  })).then((ok) => { if (ok) setText(''); });
  const item = (entry: NoteView) => (
    <NoteItem key={`${entry.note.id}:${entry.note.revision}`} view={entry} graph={graph} busy={busy}
      onSelect={onSelect} onRun={run} notes={notes} />
  );

  return (
    <section className="notes" aria-labelledby="notes-heading" data-state="on">{heading}
      <p className="muted small">Your notes, saved on this computer outside the project folder. Boozer doesn't check them and never sends them to a model.</p>
      {noticeLine}
      {here.length === 0 ? <p className="muted">No notes on this file yet.</p> : <ul className="note-list">{here.map(item)}</ul>}
      {unlinked.length > 0 && (
        <details className="note-unlinked">
          <summary>Notes not linked to lines ({unlinked.length})</summary>
          <ul className="note-list">{unlinked.map(item)}</ul>
        </details>
      )}
      <form className="note-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="note-kind">Kind</label>
        <select id="note-kind" value={kind} onChange={(event) => setKind(event.target.value as NoteKind)}>
          {KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
        <label htmlFor="note-text">Your note</label>
        <textarea id="note-text" value={text} maxLength={MAX_CHARS} rows={3} onChange={(event) => setText(event.target.value)} />
        <div className="note-lines">
          <input type="checkbox" id="note-link" checked={linked} onChange={(event) => setLinked(event.target.checked)} />
          <label htmlFor="note-link">Link to these lines</label>{' '}
          <label htmlFor="note-from">Lines</label>
          <input id="note-from" type="number" min={1} step={1} value={from} disabled={!linked} onChange={(event) => setFrom(event.target.value)} />
          <label htmlFor="note-to">to</label>
          <input id="note-to" type="number" min={1} step={1} value={to} disabled={!linked} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="note-actions">
          <button type="submit" id="note-save" disabled={busy || text.trim() === '' || (linked && (!Number.isSafeInteger(fromLine) || !Number.isSafeInteger(toLine)))}>Save</button>
        </div>
      </form>
      <div className="note-actions note-folder">
        <button type="button" id="notes-disable" className="secondary" disabled={busy} onClick={() => void run(() => notes.disable())}>Turn notes off for this launch</button>
        {confirmClear ? <>
          <button type="button" id="notes-clear-confirm" className="danger" disabled={busy} onClick={() => { setConfirmClear(false); void run(() => notes.clear()); }}>Delete every note for this folder</button>
          <button type="button" id="notes-clear-cancel" className="secondary" onClick={() => setConfirmClear(false)}>Keep notes</button>
        </> : <button type="button" id="notes-clear" className="secondary" disabled={busy} onClick={() => setConfirmClear(true)}>Delete all notes…</button>}
      </div>
    </section>
  );
}
