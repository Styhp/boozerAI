import { describe, expect, it, vi } from 'vitest';
import { clearCapability, ProjectConnection, takeCapability } from '../src/client/data/http-project-source';
import type { GraphResponse } from '../src/shared/project-api';

const capability = 'a'.repeat(64);
const key = 'boozer.local-capability';
const location = (hash = '') => ({ hash, pathname: '/', search: '' });
const history = () => ({ replaceState: vi.fn() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function storage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
  return {
    values,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
}

describe('local browser reload authority', () => {
  it('removes the launch fragment and restores its capability on repeated bare-URL reloads', () => {
    const tab = storage();
    const navigation = history();
    expect(takeCapability(location(`#cap=${capability}`), navigation, tab)).toBe(capability);
    expect(navigation.replaceState).toHaveBeenCalledWith(null, '', '/');
    for (let reload = 0; reload < 3; reload++) expect(takeCapability(location(), history(), tab)).toBe(capability);
    expect([...tab.values]).toEqual([[key, capability]]);
    expect(takeCapability(location(), history(), storage())).toBeNull();
  });
  it('replaces old authority when the launcher opens a new session', () => {
    const tab = storage(capability);
    const next = 'b'.repeat(64);
    expect(takeCapability(location(`#cap=${next}`), history(), tab)).toBe(next);
    expect(takeCapability(location(), history(), tab)).toBe(next);
    clearCapability(tab, capability);
    expect(takeCapability(location(), history(), tab)).toBe(next);
  });
  it.each(['#cap=bad', `#cap=${capability}&cap=${capability}`, `#cap=${capability}&root=/etc`, '#other=ignored'])('rejects %s without recovering an older stored capability', (hash) => {
    const tab = storage(capability);
    expect(takeCapability(location(hash), history(), tab)).toBeNull();
    expect(tab.values.size).toBe(0);
  });
  it('discards malformed stored authority and never invents a session', () => {
    const tab = storage('bad');
    expect(takeCapability(location(), history(), tab)).toBeNull();
    expect(tab.values.size).toBe(0);
    expect(takeCapability(location(), history())).toBeNull();
  });
  it('keeps a valid launch usable when storage is blocked without crashing', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(takeCapability(location(`#cap=${capability}`), history(), blocked)).toBe(capability);
    expect(takeCapability(location(), history(), blocked)).toBeNull();
    expect(() => clearCapability(blocked, capability)).not.toThrow();
  });
  it('forgets authority after close even when the close response fails', async () => {
    for (const status of [200, 500]) {
      const tab = storage(capability);
      const connection = new ProjectConnection(capability, async () => json({}, status), () => clearCapability(tab, capability));
      await connection.close('project').catch(() => undefined);
      expect(takeCapability(location(), history(), tab)).toBeNull();
      await expect(connection.session()).rejects.toMatchObject({ code: 'revoked' });
    }
  });
  it('clears and revokes the stored capability when the server rejects an old launch', async () => {
    const tab = storage(capability);
    const transport = vi.fn(async () => json({ error: { code: 'unauthorized' } }, 401));
    const connection = new ProjectConnection(capability, transport, () => clearCapability(tab, capability));
    await expect(connection.session()).rejects.toMatchObject({ status: 401 });
    expect(tab.values.size).toBe(0);
    await expect(connection.session()).rejects.toMatchObject({ code: 'revoked' });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('retains refresh authority through transient failures and forbidden requests', async () => {
    for (const status of [403, 500]) {
      const tab = storage(capability);
      const connection = new ProjectConnection(capability, async () => json({}, status), () => clearCapability(tab, capability));
      await expect(connection.session()).rejects.toMatchObject({ status });
      expect(takeCapability(location(), history(), tab)).toBe(capability);
    }
    const tab = storage(capability);
    const connection = new ProjectConnection(capability, async () => { throw new TypeError('offline'); }, () => clearCapability(tab, capability));
    await expect(connection.session()).rejects.toThrow('offline');
    expect(takeCapability(location(), history(), tab)).toBe(capability);
  });
});

describe('reload of a confirmed local project', () => {
  const project = { id: 'project', label: 'Original project', state: 'ready' as const };
  const graph: GraphResponse = {
    projectId: project.id, label: project.label, files: [],
    graph: {
      schemaVersion: 1, snapshotId: `sha256:${'b'.repeat(64)}`, extractor: { name: 'test', version: '1' }, files: [], edges: [],
      coverage: { files: { found: 0, parsed: 0, skipped: 0, skips: [], prunedDirectories: [] }, imports: { seen: 0, resolved: 0, external: 0, excluded: 0, failed: 0, issues: [] }, unsupported: [] },
    },
  };
  it('reconnects to the existing graph with GETs and never confirms or reindexes it', async () => {
    const transport = vi.fn(async (url: string) => json(url === '/api/session' ? { project, cloud: { available: false } } : graph));
    const connection = new ProjectConnection(capability, transport);
    expect(await connection.resume()).toEqual({ project, cloud: { available: false }, response: graph });
    expect(transport.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/projects/project/graph']);
    for (const [, init] of transport.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Authorization: `Bearer ${capability}` });
    }
  });
  it.each([null, { ...project, state: 'selected' }, { ...project, state: 'indexing' }, { ...project, state: 'failed' }])('never reads or confirms source for an unready project: %j', async (pending) => {
    const transport = vi.fn(async () => json({ project: pending, cloud: { available: false } }));
    expect(await new ProjectConnection(capability, transport).resume()).toEqual({ project: pending, cloud: { available: false }, response: null });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('rejects a graph belonging to another project', async () => {
    const connection = new ProjectConnection(capability, async (url) => json(url === '/api/session' ? { project, cloud: { available: false } } : { ...graph, projectId: 'another' }));
    await expect(connection.resume()).rejects.toMatchObject({ code: 'stale-snapshot' });
  });
});
