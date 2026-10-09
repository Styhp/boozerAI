import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_LINK_LINES, noteLines, noteStatus, stampLink, validRange, type CurrentFile } from '../src/server/note-status.js';
import { sourceLines } from '../src/client/map/model.js';

// Hand-written inputs and expected statuses for the pure phase-1 note status rules.
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const file = (text: string): CurrentFile => ({ text, contentHash: sha(text) });
const original = 'line one\nconst a = 1;\nconst b = 2;\nline four\nline five\n';

describe('note line numbering', () => {
  it('numbers lines exactly like the source view, including CRLF and trailing newlines', () => {
    for (const text of ['', 'a', 'a\n', 'a\n\n', '\n', 'a\r\nb\r\n', 'a\r\nb', 'a\n\nb\n', '\r\n', 'x\ry\n']) {
      expect(noteLines(text)).toEqual(sourceLines(text));
    }
    expect(noteLines('a\r\nb\r\n')).toEqual(['a\r', 'b\r']);
    expect(noteLines('a\n\n')).toEqual(['a', '']);
  });
  it('accepts only whole ranges inside the file and at most the link span cap', () => {
    const lines = noteLines(original);
    expect(validRange(lines, 1, 5)).toBe(true);
    expect(validRange(lines, 2, 2)).toBe(true);
    for (const [start, end] of [[0, 1], [1, 6], [3, 2], [1.5, 2], [-1, 2], [Number.NaN, 2]] as const) expect(validRange(lines, start, end)).toBe(false);
    const long = noteLines('x\n'.repeat(MAX_LINK_LINES + 1));
    expect(validRange(long, 1, MAX_LINK_LINES)).toBe(true);
    expect(validRange(long, 1, MAX_LINK_LINES + 1)).toBe(false);
  });
  it('stamps the whole-file hash and the exact joined range', () => {
    const link = stampLink('a.ts', file(original), 2, 3);
    expect(link).toEqual({
      file: 'a.ts', startLine: 2, endLine: 3, fileHash: sha(original),
      rangeHash: sha('const a = 1;\nconst b = 2;'), headHash: sha('const a = 1;'),
    });
  });
});

describe('note status rules', () => {
  const link = stampLink('a.ts', file(original), 2, 3);

  it('is not-linked without a link and missing when the file is not in the snapshot', () => {
    expect(noteStatus(null, file(original))).toEqual({ status: 'not-linked' });
    expect(noteStatus(link, undefined)).toEqual({ status: 'missing' });
  });
  it('is current when the whole file is unchanged', () => {
    expect(noteStatus(link, file(original))).toEqual({ status: 'current' });
  });
  it('is current when the file changed elsewhere but the same range still holds the same lines', () => {
    const changed = original.replace('line five', 'line 5 edited');
    expect(sha(changed)).not.toBe(link.fileHash);
    expect(noteStatus(link, file(changed))).toEqual({ status: 'current' });
  });
  it('is moved, with the new range, when lines are inserted above; the link is not changed', () => {
    const moved = `// inserted\n// inserted again\n${original}`;
    expect(noteStatus(link, file(moved))).toEqual({ status: 'moved', movedTo: { startLine: 4, endLine: 5 } });
    expect(link.startLine).toBe(2);
  });
  it('is stale when a linked line is edited, and shows the current text of that range', () => {
    const edited = original.replace('const b = 2;', 'const b = 3;');
    expect(noteStatus(link, file(edited))).toEqual({ status: 'stale', currentText: 'const a = 1;\nconst b = 3;' });
  });
  it('is stale when the exact lines appear more than once elsewhere (ambiguous)', () => {
    const duplicated = 'z\nz\nconst a = 1;\nconst b = 2;\nconst a = 1;\nconst b = 2;\n';
    expect(noteStatus(link, file(duplicated))).toMatchObject({ status: 'stale' });
  });
  it('stays current when the lines are duplicated but the original range still matches', () => {
    const duplicated = `${original}const a = 1;\nconst b = 2;\n`;
    expect(noteStatus(link, file(duplicated))).toEqual({ status: 'current' });
  });
  it('is stale with empty current text when the file became shorter than the range', () => {
    expect(noteStatus(stampLink('a.ts', file(original), 4, 5), file('line one\n'))).toEqual({ status: 'stale', currentText: '' });
  });
  it('bounds the current text of a stale range to 20 lines', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
    const wide = stampLink('a.ts', file(long), 1, 30);
    const result = noteStatus(wide, file(long.replace('line 5', 'line five')));
    expect(result.status).toBe('stale');
    expect(result.currentText!.split('\n')).toHaveLength(20);
    expect(result.currentText!.split('\n')[4]).toBe('line five');
  });
  it('keeps CRLF lines distinct: moved under CRLF, stale after a CRLF to LF conversion', () => {
    const crlf = 'one\r\ntwo\r\nthree\r\n';
    const crlfLink = stampLink('w.ts', file(crlf), 2, 3);
    expect(crlfLink.rangeHash).toBe(sha('two\r\nthree\r'));
    expect(noteStatus(crlfLink, file(`zero\r\n${crlf}`))).toEqual({ status: 'moved', movedTo: { startLine: 3, endLine: 4 } });
    expect(noteStatus(crlfLink, file('one\ntwo\nthree\n'))).toMatchObject({ status: 'stale' });
  });
  it('handles empty-line ranges: unique moves are moved, repeated blank lines are ambiguous', () => {
    const text = 'a\n\nb\n';
    const blank = stampLink('e.ts', file(text), 2, 2);
    expect(blank.rangeHash).toBe(sha(''));
    // Moving the only blank line: exactly one blank line elsewhere.
    expect(noteStatus(blank, file('a\nb\n\n'))).toEqual({ status: 'moved', movedTo: { startLine: 3, endLine: 3 } });
    // Several blank lines elsewhere: stale, never a guess.
    expect(noteStatus(blank, file('a\nb\n\nc\n\n'))).toMatchObject({ status: 'stale' });
    // A trailing empty line in the range: "a\n\n" has lines ['a', ''].
    const tail = stampLink('e.ts', file('a\n\n'), 1, 2);
    expect(noteStatus(tail, file('x\na\n\n'))).toEqual({ status: 'moved', movedTo: { startLine: 2, endLine: 3 } });
  });
  it('gives the same answer with or without the per-request line-hash memo', () => {
    const cache = new Map<string, readonly string[]>();
    const moved = `// inserted\n${original}`;
    expect(noteStatus(link, file(moved), cache)).toEqual(noteStatus(link, file(moved)));
    expect(noteStatus(link, file(moved), cache)).toEqual({ status: 'moved', movedTo: { startLine: 3, endLine: 4 } });
  });
});
