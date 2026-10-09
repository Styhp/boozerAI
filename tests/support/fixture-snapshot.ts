import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DependencyGraph, FileSkip, Language, SnapshotFile, SnapshotLimits, WorkspaceSnapshot,
} from '../../src/shared/contracts.js';

// Test-only stand-in for M2's InputAdapter over Boozer's own trusted fixtures. It reads
// files as bytes/text and never imports or runs them. Anything the fixture doesn't
// exercise (symlinks, ignored directories, caps) fails loudly instead of being handled.

export const basicFixtureRoot = fileURLToPath(new URL('../../fixtures/basic/src/', import.meta.url));
export const basicExpectedGraphPath = fileURLToPath(new URL('../../fixtures/basic/expected-graph.json', import.meta.url));
export const FIXTURE_CANARY = 'BZR-CANARY-ORCHID-7731';

export const ORACLE_PLACEHOLDERS = {
  snapshotId: '<FIXTURE_SNAPSHOT_ID>',
  extractor: { name: '<EXTRACTOR_NAME>', version: '<EXTRACTOR_VERSION>' },
} as const;

const fixtureLimits: SnapshotLimits = { maxFiles: 2_000, maxFileBytes: 1_048_576, maxTotalBytes: 20_971_520 };

const languages: Readonly<Record<string, Language>> = {
  '.js': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx', '.mjs': 'mjs', '.cjs': 'cjs',
};

export const bytewise = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export function loadFixtureSnapshot(root: string = basicFixtureRoot): WorkspaceSnapshot {
  const files: SnapshotFile[] = [];
  const skipped: FileSkip[] = [];
  let totalBytes = 0;
  const pending = [''];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (!entry.isFile()) {
        throw new Error(`Fixture harness supports only regular files and directories: ${path}`);
      } else {
        const language = languages[extname(entry.name)];
        if (language === undefined) {
          skipped.push({ path, reason: 'unsupported-extension' });
          continue;
        }
        const bytes = readFileSync(join(root, path));
        totalBytes += bytes.length;
        if (bytes.length > fixtureLimits.maxFileBytes || totalBytes > fixtureLimits.maxTotalBytes) {
          throw new Error(`Fixture exceeds snapshot byte limits at ${path}`);
        }
        files.push({ path, language, sizeBytes: bytes.length, contentHash: sha256(bytes), text: bytes.toString('utf8') });
      }
    }
  }
  if (files.length > fixtureLimits.maxFiles) throw new Error('Fixture exceeds the snapshot file limit');
  files.sort((a, b) => bytewise(a.path, b.path));
  skipped.sort((a, b) => bytewise(a.path, b.path));

  // Content-derived identity (paths, hashes, inventory, limits); no timestamps.
  const identity = JSON.stringify({
    files: files.map((file) => [file.path, file.contentHash]), skipped, limits: fixtureLimits,
  });
  return {
    schemaVersion: 1,
    projectId: `fixture:${basename(root)}`,
    snapshotId: `fixture-sha256:${sha256(identity)}`,
    files,
    inventory: { found: files.length + skipped.length, skipped, prunedDirectories: [] },
    limits: fixtureLimits,
    createdAt: new Date().toISOString(),
  };
}

export function loadExpectedGraph(path: string = basicExpectedGraphPath): DependencyGraph {
  return JSON.parse(readFileSync(path, 'utf8')) as DependencyGraph;
}

// For 1.4: call only after asserting that snapshot IDs are consistent and output is deterministic.
export function applyOraclePlaceholders(graph: DependencyGraph): DependencyGraph {
  const { snapshotId } = ORACLE_PLACEHOLDERS;
  return {
    ...graph,
    snapshotId,
    edges: graph.edges.map((edge) => ({ ...edge, evidence: { ...edge.evidence, snapshotId } })),
    extractor: { ...ORACLE_PLACEHOLDERS.extractor },
  };
}
