import { useEffect, useRef, useState } from 'react';
import { EMPTY_CHAT, RepoChatController, type ChatState } from './repo-chat-controller';
import type { ProjectSource } from './project-source';
import type { CloudChatSend } from '../../shared/cloud-chat';

export function useRepoChat(project: ProjectSource | null, snapshotId: string | null) {
  const [state, setState] = useState<ChatState>(EMPTY_CHAT);
  const controller = useRef<RepoChatController | null>(null);
  useEffect(() => {
    setState(EMPTY_CHAT);
    if (project?.chat === undefined || snapshotId === null) return;
    const current = new RepoChatController((body, signal) => project.chat!(body, signal), snapshotId, setState,
      project.cloudChat ? (body, signal) => project.cloudChat!(body, signal) : undefined);
    controller.current = current;
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [project, snapshotId]);
  return project?.chat === undefined || snapshotId === null ? undefined : {
    state, onAsk: (question: string, contextPath?: string) => { void controller.current?.ask(question, contextPath); },
    ...(project.cloud && project.previewCloudChat && project.cloudChat ? { cloud: {
      defaultModel: project.cloud.model,
      ...(project.cloud.models ? { models: (signal: AbortSignal) => project.cloud!.models!(signal) } : {}),
      preview: async (question: string, contextPath: string | undefined, searchDocs: boolean, signal: AbortSignal, model?: string) => {
        const current = controller.current;
        if (!current) throw new Error('Open the current project again.');
        const request = { ...current.request(question, contextPath), searchDocs, ...(model === undefined ? {} : { model }) };
        const preview = await project.previewCloudChat!(request, signal);
        if (current !== controller.current || signal.aborted) throw new Error('The project changed. Preview again.');
        return { request, preview };
      },
      send: (request: CloudChatSend) => { void controller.current?.ask(request.question, request.contextPath, request); },
    } } : {}),
    onCancel: () => controller.current?.cancel(), onClear: () => controller.current?.clear(),
  };
}
