import type { Snippet } from '../../shared/contracts';
import { CHAT_HISTORY_LIMIT, CHAT_TURN_LIMIT, isRepoChatRequest } from '../../shared/repo-chat';
import type { ExplanationState } from '../components/ExplanationPanel';
import type { ProjectSource } from './project-source';
import { isCloudChatRequest, type CloudChatSend } from '../../shared/cloud-chat';

export interface ChatTurn { readonly id: number; readonly question: string; readonly answer: ExplanationState; readonly provider?: 'local' | 'cloud' }
export interface ChatState { readonly turns: readonly ChatTurn[]; readonly running: boolean }
export const EMPTY_CHAT: ChatState = { turns: [], running: false };

// One in-memory transcript per source/snapshot. Cancel/Clear invalidate the active
// request immediately, even if a late or misbehaving stream ignores its signal.
export class RepoChatController {
  state: ChatState = EMPTY_CHAT;
  #active: AbortController | null = null;
  #nextId = 0;
  #disposed = false;
  constructor(readonly stream: NonNullable<ProjectSource['chat']>, readonly snapshotId: string,
    readonly onChange: (state: ChatState) => void, readonly cloudStream?: ProjectSource['cloudChat']) {}

  #publish(state: ChatState) { this.state = state; if (!this.#disposed) this.onChange(state); }
  #answer(id: number, answer: ExplanationState, running: boolean) {
    this.#publish({ turns: this.state.turns.map((turn) => turn.id === id ? { ...turn, answer } : turn), running });
  }

  request(question: string, contextPath?: string) {
    return { snapshotId: this.snapshotId, question: question.trim(),
      history: this.state.turns.slice(-CHAT_HISTORY_LIMIT).map((turn) => turn.question),
      ...(contextPath === undefined ? {} : { contextPath }) };
  }

  async ask(question: string, contextPath?: string, cloud?: CloudChatSend): Promise<void> {
    const body = cloud ?? this.request(question, contextPath);
    if (this.#active !== null || this.#disposed || body.snapshotId !== this.snapshotId
      || !(cloud ? this.cloudStream && isCloudChatRequest(body, true) : isRepoChatRequest(body))) return;
    const controller = new AbortController();
    this.#active = controller;
    const id = ++this.#nextId;
    let snippets: readonly Snippet[] = [];
    let text = '';
    this.#publish({ turns: [...this.state.turns.slice(-(CHAT_TURN_LIMIT - 1)), { id, question: body.question, provider: cloud ? 'cloud' : 'local',
      answer: { status: 'running', snippets, text } }], running: true });
    try {
      const events = cloud ? this.cloudStream!(cloud, controller.signal) : this.stream(body, controller.signal);
      for await (const event of events) {
        if (this.#active !== controller || controller.signal.aborted) return;
        if (event.type === 'snippets') snippets = event.snippets;
        if (event.type === 'token') text += event.text;
        if (event.type === 'done') { this.#answer(id, { status: 'done', explanation: event.explanation, details: event.details }, false); return; }
        if (event.type === 'error') { this.#answer(id, { status: 'error', code: event.code, message: event.message, snippets, text }, false); return; }
        this.#answer(id, { status: 'running', snippets, text }, true);
      }
      if (this.#active === controller) this.#answer(id, { status: 'error', code: 'runtime-error', message: 'The chat stream ended early.', snippets, text }, false);
    } catch {
      if (this.#active === controller) this.#answer(id, { status: 'error', code: cloud ? 'cloud-error' : 'runtime-error', message: 'Could not finish the answer.', snippets, text }, false);
    } finally { if (this.#active === controller) this.#active = null; }
  }

  cancel(): void {
    const active = this.#active;
    if (active === null) return;
    this.#active = null;
    active.abort();
    const turn = this.state.turns.at(-1);
    if (turn?.answer.status === 'running') this.#answer(turn.id, { ...turn.answer, status: 'error', code: 'cancelled', message: 'Chat cancelled.' }, false);
  }
  clear(): void { this.cancel(); this.#publish(EMPTY_CHAT); }
  dispose(): void { this.#disposed = true; this.#active?.abort(); this.#active = null; this.state = EMPTY_CHAT; }
}
