import type { ExplanationEvent } from '../../shared/explanation';

// Reads the NDJSON stream from POST /api/projects/:id/explanations. A malformed or
// truncated stream ends with an error event; it is never shown as a finished answer.
const TYPES = new Set(['snippets', 'token', 'done', 'error']);

export async function* readExplanationEvents(body: ReadableStream<Uint8Array>): AsyncIterable<ExplanationEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let newline: number;
      while ((newline = buffered.indexOf('\n')) >= 0 || (done && buffered.trim() !== '')) {
        const end = newline >= 0 ? newline : buffered.length;
        const line = buffered.slice(0, end).trim();
        buffered = buffered.slice(end + 1);
        if (line === '') continue;
        let event: ExplanationEvent;
        try {
          event = JSON.parse(line) as ExplanationEvent;
          if (!TYPES.has((event as { type?: string }).type ?? '')) throw new Error('unknown event');
        } catch {
          yield { type: 'error', code: 'runtime-error', message: 'The server sent a malformed explanation event.' };
          return;
        }
        yield event;
        if (event.type === 'done' || event.type === 'error') { finished = true; return; }
      }
      if (done) break;
    }
    if (!finished) yield { type: 'error', code: 'runtime-error', message: 'The explanation stream ended early.' };
  } finally {
    reader.releaseLock();
  }
}
