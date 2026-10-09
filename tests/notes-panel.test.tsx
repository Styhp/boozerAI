import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DetailPane } from '../src/client/components/DetailPane.js';
import { NotesPanel, noteSelection, type NotesView } from '../src/client/components/NotesPanel.js';
import { HttpProjectSource, ProjectApiError, ProjectConnection } from '../src/client/data/http-project-source.js';
import type { NotesSource } from '../src/client/data/project-source.js';
import { referenceState } from '../src/client/map/model.js';
import type { DependencyGraph } from '../src/shared/contracts.js';
import type { NoteView, NotesResponse } from '../src/shared/notes.js';
import type { GraphResponse } from '../src/shared/project-api.js';

const text = 'line 1\nline 2\nline 3\n';
const hash = createHash('sha256').update(text).digest('hex');
const snapshotId = `sha256:${'a'.repeat(64)}`;
const graph: DependencyGraph = {
  schemaVersion: 1, snapshotId, extractor: { name: 'test', version: '1' },
  files: [{ path: 'main.ts', language: 'ts', sizeBytes: Buffer.byteLength(text), contentHash: hash, parse: { status: 'ok' } }], edges: [],
  coverage: { files: { found: 1, parsed: 1, skipped: 0, skips: [], prunedDirectories: [] }, imports: { seen: 0, resolved: 0, external: 0, excluded: 0, failed: 0, issues: [] }, unsupported: [] },
};
const noop = () => undefined;
const source: NotesSource = {
  list: vi.fn(), enable: vi.fn(), disable: vi.fn(), create: vi.fn(), edit: vi.fn(), remove: vi.fn(), clear: vi.fn(),
};
const view = (id: string, status: NoteView['status'], extra: Partial<NoteView> = {}, noteText = `Note ${id}`): NoteView => ({
  note: {
    id: id.padStart(32, '0'), kind: 'decision', text: noteText, revision: 1, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
    link: status === 'not-linked' ? null : { file: status === 'missing' ? 'main.ts' : 'main.ts', startLine: 2, endLine: 3 },
  },
  status, ...extra,
});
const loaded = (response: NotesResponse): NotesView => ({ status: 'loaded', response });
const render = (initial: NotesView) => renderToStaticMarkup(<NotesPanel notes={source} graph={graph} path="main.ts" onSelect={noop} initial={initial} />);

describe('NotesPanel (phase 1)', () => {
  it('shows the off state with one consent button and where notes are kept', () => {
    const html = render(loaded({ enabled: false, state: 'ok', notes: [] }));
    expect(html).toContain('Notes are off for this folder.');
    expect(html).toContain('Remember notes for this folder');
    expect(html).toContain('Notes are saved on this computer, outside the project folder.');
    expect(html).not.toContain('id="note-text"');
  });

  it('shows the store error state without any editing controls', () => {
    const html = render(loaded({ enabled: true, state: 'error', errorCode: 'store-corrupt', notes: [] }));
    expect(html).toContain('Notes couldn&#x27;t be read (store-corrupt). Nothing was changed. The rest of Boozer works normally.');
    expect(html).not.toContain('id="note-text"');
    expect(html).not.toContain('Delete');
  });

  it('shows the request failure state', () => {
    expect(render({ status: 'failed', code: 'notes-unavailable' })).toContain('(notes-unavailable)');
  });

  it('renders badges, the add form with stable ids, and labels notes as the user’s own', () => {
    const html = render(loaded({ enabled: true, state: 'ok', notes: [
      view('1', 'current'), view('2', 'moved', { movedTo: { startLine: 4, endLine: 5 } }),
      view('3', 'stale', { currentText: 'line 2 changed' }), view('4', 'missing'), view('5', 'not-linked'),
    ] }));
    for (const badge of ['Current', 'Moved', 'Stale', 'Missing', 'Not linked']) expect(html).toContain(`>${badge}</span>`);
    expect(html).toContain('Your notes');
    expect(html).toContain('aria-label="Your note"');
    expect(html).toContain('Update link');
    expect(html).toContain('These exact lines are now at 4–5');
    expect(html).toContain('line 2 changed');
    expect(html).toContain('The linked file is not in this snapshot.');
    expect(html).toContain('Notes not linked to lines (1)');
    for (const id of ['note-kind', 'note-text', 'note-from', 'note-to', 'note-link', 'note-save', 'notes-disable', 'notes-clear']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Link to these lines');
    expect(html).not.toMatch(/verified|fact/i);
  });

  it('links (and so highlights) only current notes; moved, stale and missing never open lines', () => {
    const html = render(loaded({ enabled: true, state: 'ok', notes: [view('1', 'current')] }));
    expect(html).toContain('<button type="button" class="link">main.ts:2–3</button>');
    for (const status of ['moved', 'stale', 'missing'] as const) {
      const other = render(loaded({ enabled: true, state: 'ok', notes: [view('1', status, status === 'moved' ? { movedTo: { startLine: 4, endLine: 5 } } : {})] }));
      expect(other).not.toContain('class="link">main.ts:2–3');
      expect(other).toContain('<code class="note-range">main.ts:2–3</code>');
      expect(noteSelection(view('1', status), graph)).toBeNull();
    }
    expect(noteSelection(view('1', 'not-linked'), graph)).toBeNull();
    const selection = noteSelection(view('1', 'current'), graph);
    expect(selection).toEqual({ kind: 'range', ref: { snapshotId, file: 'main.ts', startLine: 2, endLine: 3, contentHash: hash } });
    // The existing range selection highlights exactly those lines in the loaded source.
    const loadedSource = { snapshotId, path: 'main.ts', contentHash: hash, text };
    if (selection?.kind !== 'range') throw new Error('expected a range selection');
    expect(referenceState(selection.ref, loadedSource)).toBe('current');
    const pane = renderToStaticMarkup(<DetailPane graph={graph} selection={selection} source={{ status: 'loaded', source: loadedSource }} onSelect={noop} />);
    expect(pane.match(/class="line evidence"/g)).toHaveLength(2);
  });

  it('escapes hostile note and line text', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = render(loaded({ enabled: true, state: 'ok', notes: [view('1', 'stale', { currentText: hostile }, hostile)] }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('is mounted by DetailPane for file selections only, and only when a notes source exists', () => {
    const file = { kind: 'file', path: 'main.ts' } as const;
    const sourceState = { status: 'loading', path: 'main.ts' } as const;
    expect(renderToStaticMarkup(<DetailPane graph={graph} selection={file} source={sourceState} onSelect={noop} notes={source} />)).toContain('Your notes');
    expect(renderToStaticMarkup(<DetailPane graph={graph} selection={file} source={sourceState} onSelect={noop} />)).not.toContain('Your notes');
    const range = { kind: 'range', ref: { snapshotId, file: 'main.ts', startLine: 1, endLine: 1, contentHash: hash } } as const;
    expect(renderToStaticMarkup(<DetailPane graph={graph} selection={range} source={sourceState} onSelect={noop} notes={source} />)).not.toContain('Your notes');
  });
});

describe('HttpProjectSource notes methods', () => {
  const id = randomUUID();
  const envelope: GraphResponse = { projectId: id, label: 'Inert fixture', graph, files: [{ id: randomUUID(), path: 'main.ts' }] };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends only opaque IDs, the snapshot ID and the user’s note fields under the capability', async () => {
    const calls: [string, RequestInit][] = [];
    const transport = vi.fn(async (input: string, init: RequestInit) => {
      calls.push([input, init]);
      return input.includes('/notes?') ? json({ enabled: false, state: 'ok', notes: [] }) : json({ ok: true });
    });
    const project = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    const noteId = 'e'.repeat(32);
    expect(await project.notes.list(snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    await project.notes.enable();
    await project.notes.disable();
    await project.notes.create({ snapshotId, kind: 'decision', text: 'Mine', link: { path: 'main.ts', startLine: 1, endLine: 2 } });
    await project.notes.edit(noteId, { snapshotId, revision: 1, text: 'Edited' });
    await project.notes.remove(noteId, 2);
    await project.notes.clear();
    expect(calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      [`/api/projects/${id}/notes?snapshotId=${encodeURIComponent(snapshotId)}`, 'GET', undefined],
      [`/api/projects/${id}/notes/enable`, 'POST', '{}'],
      [`/api/projects/${id}/notes/disable`, 'POST', '{}'],
      [`/api/projects/${id}/notes`, 'POST', JSON.stringify({ snapshotId, kind: 'decision', text: 'Mine', link: { path: 'main.ts', startLine: 1, endLine: 2 } })],
      [`/api/projects/${id}/notes/${noteId}`, 'POST', JSON.stringify({ snapshotId, revision: 1, text: 'Edited' })],
      [`/api/projects/${id}/notes/${noteId}/delete`, 'POST', JSON.stringify({ revision: 2 })],
      [`/api/projects/${id}/notes/clear`, 'POST', '{}'],
    ]);
    for (const [, init] of calls) expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'c'.repeat(64)}`);
    await expect(project.notes.edit('../confirm', { snapshotId, revision: 1, text: 'x' })).rejects.toBeInstanceOf(ProjectApiError);
    expect(calls).toHaveLength(7);
  });

  it('surfaces only sanitized error codes', async () => {
    const project = new HttpProjectSource(new ProjectConnection('c'.repeat(64), async () => json({ error: { code: 'store-read-only' } }, 409)), envelope);
    await expect(project.notes.create({ snapshotId, kind: 'decision', text: 'x' })).rejects.toMatchObject({ status: 409, code: 'store-read-only' });
  });
});
