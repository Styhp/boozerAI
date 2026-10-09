import { isBuiltin } from 'node:module';
import type { EdgeTarget, FilePath, FileSkip, SnapshotFile } from './contracts.js';

export const RESOLVER_VERSION = 'snapshot-relative-v2';
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** A text/path index only: no compiler host, filesystem lookup or target config. */
export class SnapshotResolver {
  readonly #files: ReadonlySet<FilePath>;
  readonly #skips: ReadonlyMap<FilePath, FileSkip['reason']>;

  constructor(files: readonly SnapshotFile[], skips: readonly FileSkip[]) {
    this.#files = new Set(files.map((file) => file.path));
    this.#skips = new Map(skips.map((skip) => [skip.path, skip.reason]));
  }

  resolve(from: FilePath, specifier: string): EdgeTarget {
    if (/^(?:[/\\]|[a-z]:)/i.test(specifier)) return { type: 'unresolved', reason: 'absolute-path' };
    if (specifier.startsWith('#') || specifier.startsWith('@/') || specifier.startsWith('~/')) {
      return { type: 'unresolved', reason: 'unsupported-alias' };
    }
    if (specifier.length === 0 || specifier.includes('\\') || specifier.includes('\0')
      || (/^[a-z][a-z\d+.-]*:/i.test(specifier) && !specifier.startsWith('node:'))) {
      return { type: 'unresolved', reason: 'unsupported-syntax' };
    }
    if (specifier !== '.' && specifier !== '..' && !specifier.startsWith('./') && !specifier.startsWith('../')) {
      return { type: 'package', name: specifier, builtin: isBuiltin(specifier) };
    }

    const parts = from.split('/').slice(0, -1);
    for (const part of specifier.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (parts.length === 0) return { type: 'unresolved', reason: 'outside-root' };
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    const path = parts.join('/');
    const candidates = [path, ...extensions.map((extension) => path + extension)];
    if (path.endsWith('.js')) candidates.push(path.slice(0, -3) + '.ts', path.slice(0, -3) + '.tsx');
    candidates.push(...extensions.map((extension) => `${path === '' ? '' : `${path}/`}index${extension}`));
    for (const candidate of candidates) {
      if (this.#files.has(candidate)) return { type: 'file', path: candidate };
      const reason = this.#skips.get(candidate);
      if (reason !== undefined) return { type: 'excluded', path: candidate, reason };
    }
    return { type: 'unresolved', reason: 'not-found' };
  }
}
