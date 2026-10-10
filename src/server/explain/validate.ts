import type { Explanation, FilePath, Snippet, WorkspaceSnapshot } from '../../shared/contracts.js';
import type { PathMention, SuspectedInjection } from '../../shared/explanation.js';

// Checks what the model wrote against what it was given. Unknown markers and unknown
// file names are flagged and kept; nothing is silently fixed or dropped. A valid
// citation shows provenance, not that the claim is correct.

const CITATION = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;
const PATH_LIKE = /(?<![\w@/.-])(?:\.{1,2}\/)?(?:[\w.-]+\/)*[\w-][\w.-]*\.(?:tsx?|jsx?|mjs|cjs|json|css|md)(?![\w/-])/g;

export function validateCitations(text: string, snippets: readonly Snippet[]): Explanation['citations'] {
  const ids = new Set(snippets.map((s) => s.id));
  return [...text.matchAll(CITATION)].flatMap((match) =>
    match[1]!.split(/\s*,\s*/).map((id) => (ids.has(id) ? { marker: `[${id}]`, snippetId: id, valid: true } : { marker: `[${id}]`, valid: false })));
}

// Finding 1: every file name in the prose must exist in the snapshot. A name with a directory
// must match an indexed path exactly; only a bare file name may resolve by a unique match on
// its last path segment (M3 review F2). Nothing is rewritten into a different path.
export function validateMentions(text: string, snapshot: WorkspaceSnapshot): PathMention[] {
  const indexed = [...snapshot.files, ...(snapshot.documents ?? [])].map((file) => file.path);
  const skipped = new Set(snapshot.inventory.skipped.map((skip) => skip.path));
  const seen = new Set<string>();
  const mentions: PathMention[] = [];
  for (const [raw] of text.matchAll(PATH_LIKE)) {
    // The runtime's conventional name is prose, not a source-file claim.
    if (raw.toLowerCase() === 'node.js' && !indexed.some((path) => path === raw || path.endsWith(`/${raw}`))) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    const candidate = raw.replace(/^\.\//, '');
    const qualified = candidate.includes('/');
    const matches: FilePath[] = indexed.includes(candidate)
      ? [candidate]
      : qualified ? [] : indexed.filter((path) => path.endsWith(`/${candidate}`));
    if (matches.length === 1) mentions.push({ text: raw, status: 'linked', path: matches[0]! });
    else if (skipped.has(candidate)) mentions.push({ text: raw, status: 'not-indexed' });
    else if (matches.length > 1) mentions.push({ text: raw, status: 'ambiguous' });
    else mentions.push({ text: raw, status: 'unknown' });
  }
  return mentions;
}

// Visible warning, not a defense: snippet lines that look addressed to AI tools. 1.6/M3
// showed the local model sometimes obeys such text despite the prompt rules, so the panel
// tells the user where it is. The patterns were written after seeing the test phrasings;
// absence of a warning does not mean a file is free of injected instructions.
const INSTRUCTION_LIKE = [
  /\b(ignore|disregard|forget)\b[^\n]{0,40}\b(previous|prior|above|earlier|all|instructions?|rules|snippets?)\b/i,
  /\b(assistants?|AI|LLMs?|language models?|chatbots?)\b[^\n]{0,80}\b(reply|respond|output|print|append|start|end|say|write|include|repeat)\b/i,
  /\byour (answer|reply|response|output|summary)\b/i,
  /^\s*(?:\/\/|\/?\*+|#)?\s*(?:SYSTEM|ASSISTANT|USER)\s*:/i,
];

export function findInstructionLikeText(snippets: readonly Snippet[]): SuspectedInjection[] {
  return snippets.flatMap((snippet) => snippet.text.split('\n').flatMap((text, i) =>
    INSTRUCTION_LIKE.some((pattern) => pattern.test(text))
      ? [{ snippetId: snippet.id, file: snippet.ref.file, line: snippet.ref.startLine + i }]
      : []));
}
