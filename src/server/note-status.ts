import { createHash } from 'node:crypto';
import type { NoteStatus } from '../shared/notes.js';

// Pure note-status rules (phase 1). No I/O: callers pass the stored link and the current
// file text/hash from the in-memory snapshot. Ambiguity resolves to `stale`: absent beats
// approximate, so a note is never shown as pointing at lines it can't prove are its own.

export const MAX_LINK_LINES = 200;
export const MAX_CURRENT_TEXT_LINES = 20;

export interface StoredLink {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  // sha256 hex of the whole file at save time (same format as SnapshotFile.contentHash).
  readonly fileHash: string;
  // sha256 hex of the exact linked lines joined with "\n".
  readonly rangeHash: string;
  // sha256 hex of the first linked line; narrows the moved-lines search to candidate starts.
  readonly headHash: string;
}

export interface CurrentFile {
  readonly text: string;
  readonly contentHash: string;
}

export interface StatusResult {
  readonly status: NoteStatus;
  readonly movedTo?: { readonly startLine: number; readonly endLine: number };
  readonly currentText?: string;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// Must number lines exactly like the source view (sourceLines in src/client/map/model.ts) and
// the retriever: split on "\n" only, so a CRLF line keeps its "\r"; a final newline adds no line.
export function noteLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function rangeText(lines: readonly string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join('\n');
}

export function validRange(lines: readonly string[], startLine: number, endLine: number): boolean {
  return Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine)
    && startLine >= 1 && endLine >= startLine && endLine <= lines.length
    && endLine - startLine + 1 <= MAX_LINK_LINES;
}

/** Hashes the server stamps when a link is saved or re-linked. */
export function stampLink(file: string, current: CurrentFile, startLine: number, endLine: number): StoredLink {
  const lines = noteLines(current.text);
  return {
    file, startLine, endLine, fileHash: current.contentHash,
    rangeHash: sha256(rangeText(lines, startLine, endLine)),
    headHash: sha256(lines[startLine - 1] ?? ''),
  };
}

// Optional per-request memo of per-line hashes keyed by contentHash; it changes no result.
export type LineHashCache = Map<string, readonly string[]>;

function lineHashes(current: CurrentFile, lines: readonly string[], cache?: LineHashCache): readonly string[] {
  const cached = cache?.get(current.contentHash);
  if (cached !== undefined) return cached;
  const hashes = lines.map(sha256);
  cache?.set(current.contentHash, hashes);
  return hashes;
}

export function noteStatus(link: StoredLink | null, current: CurrentFile | undefined, cache?: LineHashCache): StatusResult {
  if (link === null) return { status: 'not-linked' };
  if (current === undefined) return { status: 'missing' };
  if (link.fileHash === current.contentHash) return { status: 'current' };
  const lines = noteLines(current.text);
  const span = link.endLine - link.startLine + 1;
  if (link.endLine <= lines.length && sha256(rangeText(lines, link.startLine, link.endLine)) === link.rangeHash) {
    return { status: 'current' };
  }
  // The exact line sequence elsewhere, exactly once, is `moved`; zero or several is `stale`.
  const heads = lineHashes(current, lines, cache);
  let found: number | null = null;
  let matches = 0;
  for (let start = 1; start + span - 1 <= lines.length && matches < 2; start += 1) {
    if (start === link.startLine) continue;
    if (heads[start - 1] !== link.headHash) continue;
    if (sha256(rangeText(lines, start, start + span - 1)) !== link.rangeHash) continue;
    matches += 1;
    found = start;
  }
  if (matches === 1 && found !== null) {
    return { status: 'moved', movedTo: { startLine: found, endLine: found + span - 1 } };
  }
  const shownEnd = Math.min(link.endLine, link.startLine + MAX_CURRENT_TEXT_LINES - 1);
  return { status: 'stale', currentText: rangeText(lines, link.startLine, shownEnd) };
}
