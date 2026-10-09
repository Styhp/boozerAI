import type { DependencyGraph, FilePath, Snippet, SnapshotFile, WorkspaceSnapshot } from '../../shared/contracts.js';

// Picks hash-bound source excerpts for a file-level explanation (P-3), within a budget
// sized for CPU inference (P-5: about 500 prompt tokens in total). Snippet text is always
// the exact source lines its EvidenceRef names.

// 1.6 measured about 3.7 characters per token on fixture code; 3.5 keeps estimates safe.
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);
export const SNIPPET_TOKEN_BUDGET = 380;   // leaves room for the fixed instructions
const SELECTED_SHARE = 0.65;
const RELATED_MAX_LINES = 12;
const MAX_IMPORTERS = 2;
const MAX_DEPENDENCIES = 2;

const linesOf = (text: string) => {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

// Longest prefix of whole lines (from startLine) that fits the token budget; at least one line.
function fittingRange(lines: readonly string[], startLine: number, endLine: number, tokens: number) {
  let end = startLine;
  let used = estimateTokens(lines[startLine - 1] ?? '');
  while (end < endLine) {
    const next = estimateTokens(`\n${lines[end] ?? ''}`);
    if (used + next > tokens) break;
    used += next;
    end += 1;
  }
  return { endLine: end, tokens: used };
}

export function retrieveSnippets(snapshot: WorkspaceSnapshot, graph: DependencyGraph, selected: FilePath, budget = SNIPPET_TOKEN_BUDGET): Snippet[] {
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  const snippets: Snippet[] = [];
  let remaining = budget;

  const add = (file: SnapshotFile, startLine: number, endLine: number, tokens: number, reason: string) => {
    const lines = linesOf(file.text);
    const fit = fittingRange(lines, startLine, Math.min(endLine, lines.length), tokens);
    if (fit.tokens > remaining) return;
    remaining -= fit.tokens;
    snippets.push({
      id: `S${snippets.length + 1}`,
      ref: { snapshotId: snapshot.snapshotId, file: file.path, startLine, endLine: fit.endLine, contentHash: file.contentHash },
      text: lines.slice(startLine - 1, fit.endLine).join('\n'),
      reason: fit.endLine < endLine ? `${reason} (lines ${startLine}–${fit.endLine} of ${endLine})` : reason,
    });
  };

  const own = files.get(selected);
  if (own === undefined) return [];
  add(own, 1, linesOf(own.text).length, Math.floor(budget * SELECTED_SHARE), 'selected file');

  // Who uses it: the importing statement in each direct importer (lowest edge IDs first).
  const importers = graph.edges
    .filter((edge) => edge.target.type === 'file' && edge.target.path === selected && edge.from !== selected)
    .filter((edge, i, all) => all.findIndex((other) => other.from === edge.from) === i)
    .slice(0, MAX_IMPORTERS);
  for (const edge of importers) {
    const file = files.get(edge.from);
    if (file?.contentHash === edge.evidence.contentHash) {
      add(file, edge.evidence.startLine, edge.evidence.endLine, remaining, `imports ${selected}`);
    }
  }

  // What it uses: the opening lines of each direct local dependency.
  const dependencies = [...new Set(graph.edges
    .filter((edge) => edge.from === selected && edge.target.type === 'file')
    .map((edge) => (edge.target as { path: FilePath }).path))]
    .filter((path) => path !== selected)
    .slice(0, MAX_DEPENDENCIES);
  for (const path of dependencies) {
    const file = files.get(path);
    if (file !== undefined && remaining > 20) {
      add(file, 1, Math.min(RELATED_MAX_LINES, linesOf(file.text).length), remaining, `imported by ${selected}`);
    }
  }
  return snippets;
}
