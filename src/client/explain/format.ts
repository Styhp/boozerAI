import type { PathMention } from '../../shared/explanation';

// Finding 8: models don't reliably obey "no formatting", so a small subset is rendered
// (paragraphs, "- " bullets, `inline code`, **bold**) and everything else stays literal
// text. The output is data for React text nodes; no HTML is ever produced or parsed.

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'citation'; readonly id: string }
  | { readonly kind: 'mention'; readonly text: string; readonly mention: PathMention; readonly code: boolean };

export type Block =
  | { readonly kind: 'paragraph'; readonly inline: readonly Inline[] }
  | { readonly kind: 'list'; readonly items: readonly (readonly Inline[])[] };

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[(S\d+(?:\s*,\s*S\d+)*)\]/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function withMentions(text: string, mentions: readonly PathMention[]): Inline[] {
  if (mentions.length === 0 || text === '') return text === '' ? [] : [{ kind: 'text', text }];
  const names = [...mentions].sort((a, b) => b.text.length - a.text.length).map((m) => escapeRegExp(m.text));
  const pattern = new RegExp(`(?<![\\w@/.-])(${names.join('|')})(?![\\w/-])`, 'g');
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'mention', text: match[1]!, mention: mentions.find((m) => m.text === match[1])!, code: false });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export function formatInline(text: string, mentions: readonly PathMention[] = []): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    parts.push(...withMentions(text.slice(last, match.index), mentions));
    const [, code, bold, citations] = match;
    if (code !== undefined) {
      const mention = mentions.find((m) => m.text === code);
      parts.push(mention ? { kind: 'mention', text: code, mention, code: true } : { kind: 'code', text: code });
    } else if (bold !== undefined) {
      parts.push({ kind: 'bold', text: bold });
    } else {
      for (const id of citations!.split(/\s*,\s*/)) parts.push({ kind: 'citation', id });
    }
    last = match.index + match[0].length;
  }
  parts.push(...withMentions(text.slice(last), mentions));
  return parts;
}

export function formatExplanation(text: string, mentions: readonly PathMention[] = []): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', inline: formatInline(paragraph.join(' '), mentions) });
    if (items.length > 0) blocks.push({ kind: 'list', items: items.map((item) => formatInline(item, mentions)) });
    paragraph = [];
    items = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (line === '') flush();
    else if (bullet) {
      if (paragraph.length > 0) { const pending = items; items = []; flush(); items = pending; }
      items.push(bullet[1]!);
    } else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
