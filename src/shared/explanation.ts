import type { Explanation, FilePath, Snippet } from './contracts.js';

// M3 explanation wire types (P-15). Types only, so the browser can import them without
// any server code. The route streams ExplanationEvent values as NDJSON: one JSON object
// per line, Content-Type `application/x-ndjson`.

// v1 (docs/benchmarks/m3-explain-v1-dev-mac.jsonl) had no word limit and hit the 300-token cap.
// v2 named "code words" in its post-snippet rule and missed a differently phrased injection
// (docs/benchmarks/m3-injection-variants-v2-dev-mac.jsonl); v3 states the rule generically.
// v4 (P-18) asks for an everyday-words summary first for readers new to programming; the injection rules are unchanged.
export const PROMPT_VERSION = 'explain-v4';

export type ExplanationErrorCode =
  | 'invalid-selection'    // selected path is not a source file in this snapshot
  | 'no-excerpt'           // no exact excerpt of the selected file fits the budget; model not called
  | 'stale-snapshot'       // request/graph snapshot differs from the current snapshot
  | 'runtime-unavailable'  // nothing answering on 127.0.0.1:11434
  | 'model-missing'        // the approved tag is not installed
  | 'model-mismatch'       // the tag is installed with a different digest
  | 'timeout'
  | 'cancelled'
  | 'runtime-error'
  // Optional cloud comparison (P-16). Never used as a fallback for a local failure.
  | 'cloud-unavailable'    // no OPENAI_API_KEY at launch
  | 'preview-mismatch'     // the payload to send differs from the one the user confirmed
  | 'cloud-error';         // the cloud provider refused or failed the request

// How a file path written in the model's prose relates to the snapshot (finding 1).
export interface PathMention {
  readonly text: string;
  readonly status: 'linked' | 'not-indexed' | 'ambiguous' | 'unknown';
  readonly path?: FilePath;   // set only when status is 'linked'
}

// A snippet line that looks addressed to AI tools (a warning, not proof of an attack).
export interface SuspectedInjection {
  readonly snippetId: string;
  readonly file: FilePath;
  readonly line: number;
}

export interface ExplanationDetails {
  readonly promptVersion: string;
  readonly modelDigest: string | null;   // local runtime digest; null for cloud answers
  readonly runtimeVersion: string;
  readonly promptTokens: number | null;
  readonly outputTokens: number | null;
  readonly truncated: boolean;       // output hit the token cap
  readonly thinkingSeen: boolean;    // thinking text appeared despite think: false
  readonly mentions: readonly PathMention[];
  readonly suspectedInjections: readonly SuspectedInjection[];
}

export type ExplanationEvent =
  | { readonly type: 'snippets'; readonly snippets: readonly Snippet[] }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'done'; readonly explanation: Explanation; readonly details: ExplanationDetails }
  | { readonly type: 'error'; readonly code: ExplanationErrorCode; readonly message: string };

// Body of POST /api/projects/:id/explanations. `provider` defaults to 'local'. A cloud
// request must carry the hash of the preview the user confirmed (P-16).
export interface ExplainRequestBody {
  readonly snapshotId: string;
  readonly path: FilePath;
  readonly provider?: 'local' | 'cloud';
  readonly previewHash?: string;
}

// What the browser may learn about the optional cloud provider: never the key.
export type CloudStatus =
  | { readonly available: false }
  | { readonly available: true; readonly provider: 'OpenAI'; readonly model: string; readonly endpoint: string };

// The exact request body that would be sent to the cloud provider, minus the
// Authorization header, plus the hash the user's confirmation must send back.
export interface CloudPreview {
  readonly provider: 'OpenAI';
  readonly endpoint: string;
  readonly model: string;
  readonly payload: unknown;
  readonly payloadJson: string;
  readonly previewHash: string;
  readonly suspectedInjections: readonly SuspectedInjection[];
}

export type RuntimeStatus =
  | { readonly state: 'ready'; readonly runtimeVersion: string; readonly model: string; readonly digest: string }
  | { readonly state: 'runtime-unavailable' | 'model-missing' | 'model-mismatch'; readonly message: string };
