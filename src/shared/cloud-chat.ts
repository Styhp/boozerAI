import type { RepoChatRequest } from './repo-chat.js';
import { isRepoChatRequest } from './repo-chat.js';

export const CLOUD_CHAT_PROMPT_VERSION = 'cloud-chat-v1';
export const OPENAI_DOC_DOMAINS = ['developers.openai.com', 'platform.openai.com', 'learn.chatgpt.com'] as const;
export interface CloudChatRequest extends RepoChatRequest { readonly searchDocs: boolean }
export interface CloudChatSend extends CloudChatRequest { readonly previewHash: string }
export interface WebCitation { readonly id: string; readonly url: string; readonly title: string }

export function isCloudChatRequest(value: unknown, send: true): value is CloudChatSend;
export function isCloudChatRequest(value: unknown, send?: false): value is CloudChatRequest;
export function isCloudChatRequest(value: unknown, send: boolean): value is CloudChatRequest | CloudChatSend;
export function isCloudChatRequest(value: unknown, send = false): value is CloudChatRequest | CloudChatSend {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { searchDocs, previewHash, ...request } = value as Record<string, unknown>;
  return typeof searchDocs === 'boolean' && isRepoChatRequest(request)
    && (send ? typeof previewHash === 'string' && /^[a-f0-9]{64}$/.test(previewHash) : !Object.hasOwn(value, 'previewHash'));
}

export function isOfficialDocsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === ''
      && OPENAI_DOC_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
