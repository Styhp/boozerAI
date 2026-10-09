import { useEffect, useRef, useState } from 'react';
import { EMPTY_CHAT, RepoChatController, type ChatState } from './repo-chat-controller';
import type { ProjectSource } from './project-source';

export function useRepoChat(project: ProjectSource | null, snapshotId: string | null) {
  const [state, setState] = useState<ChatState>(EMPTY_CHAT);
  const controller = useRef<RepoChatController | null>(null);
  useEffect(() => {
    setState(EMPTY_CHAT);
    if (project?.chat === undefined || snapshotId === null) return;
    const current = new RepoChatController((body, signal) => project.chat!(body, signal), snapshotId, setState);
    controller.current = current;
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [project, snapshotId]);
  return project?.chat === undefined || snapshotId === null ? undefined : {
    state, onAsk: (question: string, contextPath?: string) => { void controller.current?.ask(question, contextPath); },
    onCancel: () => controller.current?.cancel(), onClear: () => controller.current?.clear(),
  };
}
