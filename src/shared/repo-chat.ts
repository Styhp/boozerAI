import type { DependencyGraph, WorkspaceSnapshot } from './contracts.js';
import type { ExplanationEvent } from './explanation.js';

export const CHAT_QUESTION_LIMIT = 600;
export const CHAT_HISTORY_LIMIT = 2;
export const CHAT_TURN_LIMIT = 8;
export const CHAT_PROMPT_VERSION = 'repo-chat-v1';

export interface RepoChatRequest {
  readonly snapshotId: string;
  readonly question: string;
  readonly history: readonly string[];
  readonly contextPath?: string;
}

export interface RepoChatService {
  chat(request: RepoChatRequest & { snapshot: WorkspaceSnapshot; graph: DependencyGraph; signal?: AbortSignal }): AsyncIterable<ExplanationEvent>;
}

// Accept only user questions. Browser-supplied roles, answers, source and providers
// cannot become model instructions or evidence through this endpoint.
export function isRepoChatRequest(value: unknown): value is RepoChatRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['snapshotId', 'question', 'history', 'contextPath'].includes(key))) return false;
  const question = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0 && text.length <= CHAT_QUESTION_LIMIT;
  return typeof body.snapshotId === 'string' && body.snapshotId.length > 0 && body.snapshotId.length <= 100
    && question(body.question) && Array.isArray(body.history) && body.history.length <= CHAT_HISTORY_LIMIT && body.history.every(question)
    && (!Object.hasOwn(body, 'contextPath') || (typeof body.contextPath === 'string' && body.contextPath.length > 0 && body.contextPath.length <= 512));
}
