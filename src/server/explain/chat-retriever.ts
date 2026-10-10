import type { DependencyGraph, Snippet, WorkspaceSnapshot } from '../../shared/contracts.js';
import type { RepoChatRequest } from '../../shared/repo-chat.js';
import { estimateTokens } from './retriever.js';

export const CHAT_SNIPPET_BUDGET = 800;
const STOP = new Set('a an and are as at be can could do does explain for from here how i in is it me of on or please repo repository project code codebase tell that the their them these this to what where which with work works working you'.split(' '));
// Keep full identifiers and their camel/snake-case words. "local" must not match "Locality".
const tokens = (text: string) => new Set([
  ...text.toLowerCase().split(/[^\p{L}\p{N}_]+/u),
  ...text.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u),
]);
const terms = (text: string) => [...tokens(text)].filter((word) => word.length >= 3 && word.length <= 80 && !STOP.has(word));
const hits = (text: ReadonlySet<string>, words: readonly string[], weight = (_word: string) => 1) =>
  words.reduce((score, word) => score + (text.has(word) ? weight(word) : 0), 0);
const bytewise = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const symbols = (text: string) => [...text.matchAll(/\.([A-Za-z_$][\w$]{2,})/g)].map((match) => match[1]!.toLowerCase());
const namedTarget = (words: ReadonlySet<string>, question: string) => [...question.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]{2,})/g)]
  .some((match) => words.has(match[1]!.toLowerCase()) && words.has(match[2]!.toLowerCase()));
export const followsChatTopic = (question: string) => symbols(question).length === 0
  && /\b(it|its|they|them|their|that|those|these)\b/i.test(question);

// Search the authorized snapshot as text. A match is a retrieval hint, not proof of
// semantics. Whole source lines and their original hash remain the only evidence.
export function retrieveChatSnippets(snapshot: WorkspaceSnapshot, graph: DependencyGraph, request: RepoChatRequest, budget = CHAT_SNIPPET_BUDGET): Snippet[] {
  if (snapshot.snapshotId !== graph.snapshotId || !Number.isFinite(budget) || budget <= 0) return [];
  // These are search terms/section hints, never answer text or project-specific facts.
  const stack = /\b(tech(?:nology)?\s*stack|technologies|frameworks?|dependencies|libraries|packages|programming languages?|built with|written in)\b/i.test(request.question);
  const current = [...new Set([...terms(request.question), ...(stack ? ['engines', 'dependencies', 'devdependencies', 'stack', 'frameworks'] : [])])];
  const followsTopic = followsChatTopic(request.question);
  const prior = followsTopic ? terms(request.history.join(' ')) : [];
  const currentSymbols = symbols(request.question);
  const priorSymbols = followsTopic ? symbols(request.history.join(' ')) : [];
  // Pronouns without a newly named method keep the earlier question's target.
  // Generic words such as "compare" must not displace that method with UI code.
  const overview = /\b(overview|entry|start)\b|\b(repo|repository|project|codebase)\b.*\b(do|work|structure)\b/i.test(request.question);
  const hashes = new Map([...graph.files, ...(graph.documents ?? [])].map((file) => [file.path, file.contentHash]));
  const candidates = [...snapshot.files, ...(snapshot.documents ?? [])].filter((file) => file.text.trim() !== '' && hashes.get(file.path) === file.contentHash).map((file) => {
    const words = tokens(`${file.path}\n${file.text}`);
    return { file, matches: new Set(current.filter((word) => words.has(word))),
      symbolMatch: 'language' in file && namedTarget(words, request.question),
      topicMatch: followsTopic && 'language' in file && namedTarget(words, request.history.join(' ')) };
  });
  const frequency = new Map(current.map((word) => [word, candidates.filter(({ matches }) => matches.has(word)).length]));
  // A specific subject appearing in few files should outrank common UI words in paths.
  const weight = (word: string) => 1 + Math.log((candidates.length + 1) / ((frequency.get(word) ?? 0) + 1));
  // No matches for a new subject is missing evidence, not a request to reuse the selection.
  const generic = current.length === 0;
  const ranked = candidates.flatMap(({ file, matches, topicMatch, symbolMatch }) => {
    const lines = file.text.split('\n');
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    let best = 0;
    let center = 0;
    let sectionHeading = false;
    lines.forEach((line, index) => {
      const lower = tokens(line);
      const heading = 'kind' in file && file.kind === 'markdown' && /^#{1,6}\s/.test(line);
      const relevantHeading = stack && heading && hits(lower, current) > 0;
      const score = hits(lower, current, weight) * (heading ? 6 : 3) + hits(lower, prior)
        + hits(lower, currentSymbols) * 12 + hits(lower, priorSymbols) * (followsTopic ? 40 : 4);
      if ((relevantHeading && !sectionHeading) || (relevantHeading === sectionHeading && score > best)) {
        best = score; center = index; sectionHeading = relevantHeading;
      }
    });
    const path = file.path.toLowerCase();
    const pathWords = tokens(file.path);
    const score = hits(matches, current, weight) * 8 + hits(pathWords, current, weight) * 4 + hits(pathWords, prior) * 2 + best
      + (file.path === request.contextPath ? (generic || followsTopic ? 24 : matches.size > 0 ? 4 : 0) : 0)
      + (overview && /(?:^|\/)(?:main|index|app|server)\.[cm]?[jt]sx?$/i.test(file.path) ? 6 : 0);
    const base = { file, lines, center, topicMatch, symbolMatch, sectionHeading, sectionEnd: lines.length - 1, section: false,
      manifestRank: stack && 'kind' in file && file.kind === 'markdown' && matches.size > 0 ? 1 : 0,
      score: score * (/(?:^|\/)(?:tests?|fixtures)(?:\/|$)|\.test\./.test(path) ? 0.5 : 1) };
    if (stack && 'kind' in file && file.kind === 'manifest') {
      // Keep runtime and dependency blocks as separate original-line excerpts. A long
      // scripts block must not consume the budget before the package declarations.
      const sections = lines.flatMap((line, index) => {
        const match = /^(\s*)"(?:engines|dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:/.exec(line);
        if (!match) return [];
        const nextKey = lines.findIndex((next, at) => at > index && next.startsWith(`${match[1]}"`));
        return [{ ...base, center: index, section: true, sectionEnd: nextKey < 0 ? lines.length - 1 : nextKey - 1,
          manifestRank: file.path === 'package.json' ? 3 : 2, score: Math.max(1, base.score) }];
      });
      if (sections.length) return sections;
    }
    return [base];
  // Preserve an explicitly named method on pronoun follow-ups before ranking new vocabulary.
  }).filter(({ score }) => score > 0).sort((a, b) => Number(b.symbolMatch) - Number(a.symbolMatch)
    || Number(b.topicMatch) - Number(a.topicMatch) || b.manifestRank - a.manifestRank
    || Number(b.sectionHeading) - Number(a.sectionHeading)
    || b.score - a.score || bytewise(a.file.path, b.file.path) || a.center - b.center);

  const snippets: Snippet[] = [];
  let remaining = Math.min(CHAT_SNIPPET_BUDGET, Math.floor(budget));
  for (const { file, lines, center, section, sectionHeading, sectionEnd } of ranked) {
    if (snippets.length === 4 || remaining <= 0) break;
    const allowance = Math.min(remaining, 'kind' in file ? 400 : 240);
    let start = section || sectionHeading ? center : Math.max(0, center - 2);
    // Do not let a long preceding line hide a fitting matching line.
    if (estimateTokens(lines.slice(start, center + 1).join('\n')) > allowance) start = center;
    if (estimateTokens(lines[start] ?? '') > allowance) continue;
    let end = center;
    if (estimateTokens(lines.slice(start, end + 1).join('\n')) > allowance) continue;
    while (end + 1 < Math.min(sectionEnd + 1, start + (section ? 24 : 12))
      && estimateTokens(lines.slice(start, end + 2).join('\n')) <= allowance) end++;
    const text = lines.slice(start, end + 1).join('\n');
    remaining -= estimateTokens(text);
    snippets.push({ id: `S${snippets.length + 1}`, ref: { snapshotId: snapshot.snapshotId, file: file.path,
      startLine: start + 1, endLine: end + 1, contentHash: file.contentHash }, text, reason: 'question search in the current snapshot' });
  }
  return snippets;
}
