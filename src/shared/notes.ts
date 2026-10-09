import type { FilePath } from './contracts.js';

// Project notes, phase 1: notes the user writes, linked to lines, never read by a model.
// Types only, browser-safe. Hashes stay on the server; the wire carries none of them.

export type NoteKind = 'decision' | 'constraint' | 'question';

export interface NoteLink {
  readonly file: FilePath;
  readonly startLine: number;
  readonly endLine: number;
}

export interface Note {
  readonly id: string;
  readonly kind: NoteKind;
  readonly text: string;
  readonly link: NoteLink | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// Computed on every read against the current snapshot; never stored.
export type NoteStatus = 'current' | 'moved' | 'stale' | 'missing' | 'not-linked';

export interface NoteView {
  readonly note: Note;
  readonly status: NoteStatus;
  // Present only for `moved`: where the exact linked lines now are. Never applied automatically.
  readonly movedTo?: { readonly startLine: number; readonly endLine: number };
  // Present only for `stale`: what the linked range reads now, at most 20 lines.
  readonly currentText?: string;
}

export interface NotesResponse {
  readonly enabled: boolean;
  readonly state: 'ok' | 'error';
  readonly errorCode?: string;
  readonly notes: readonly NoteView[];
}

export interface NoteCreateBody {
  readonly snapshotId: string;
  readonly kind: NoteKind;
  readonly text: string;
  readonly link?: { readonly path: FilePath; readonly startLine: number; readonly endLine: number };
}

export interface NoteEditBody {
  readonly snapshotId: string;
  readonly revision: number;
  readonly text?: string;
  readonly kind?: NoteKind;
  readonly relink?: 'moved';
}
