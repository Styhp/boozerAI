import { useState } from 'react';
import type { DependencyGraph } from '../../shared/contracts';
import { CHAT_QUESTION_LIMIT } from '../../shared/repo-chat';
import type { ChatState } from '../data/repo-chat-controller';
import type { Selection } from '../map/model';
import { ExplanationResult } from './ExplanationPanel';

export interface RepoChatControls {
  readonly state: ChatState;
  readonly onAsk: (question: string, contextPath?: string) => void;
  readonly onCancel: () => void;
  readonly onClear: () => void;
}

export function RepoChatPanel({ graph, chat, contextPath, onSelect }: {
  graph: DependencyGraph; chat: RepoChatControls; contextPath: string | null; onSelect: (selection: Selection) => void;
}) {
  const [question, setQuestion] = useState('');
  const [includeFile, setIncludeFile] = useState(true);
  const { turns, running } = chat.state;
  const ask = () => {
    if (running || question.trim() === '' || question.length > CHAT_QUESTION_LIMIT) return;
    chat.onAsk(question, includeFile && contextPath !== null ? contextPath : undefined);
    setQuestion('');
  };
  const coverage = graph.coverage;
  return <section className="ws-repo-chat" aria-label="Chat Boozer">
    <div className="ws-chat-head"><div><h2>Chat Boozer</h2><p className="muted">Local AI · answers from source excerpts · nothing sent online</p></div>
      <button type="button" className="secondary" disabled={turns.length === 0} onClick={chat.onClear}>Clear chat</button></div>
    <p className="ws-chat-coverage">Current snapshot: {graph.files.length} code files, {graph.documents?.length ?? 0} documents. {coverage.files.skipped} files skipped,
      {' '}{coverage.files.prunedDirectories.length} folders unread, {coverage.imports.failed} imports not followed,
      {' '}{coverage.imports.excluded} imports excluded, {coverage.unsupported.length} unsupported patterns. Answers may miss code.</p>
    {turns.length === 0 && <div className="ws-chat-empty"><p>Ask where something is implemented, how it works, or what a file does.</p>
      <div className="ws-chat-suggestions">{['Where does the app start?', 'How are API requests authorized?', 'How does the local AI work?'].map((example) =>
        <button key={example} type="button" className="secondary" onClick={() => setQuestion(example)}>{example}</button>)}</div></div>}
    <div className="ws-chat-transcript" role="log" aria-label="Conversation" aria-live="off">
      {turns.map((turn) => {
        const snippets = turn.answer.status === 'done' ? turn.answer.explanation.snippets : turn.answer.status === 'idle' ? [] : turn.answer.snippets;
        return <article className="ws-chat-turn" key={turn.id} aria-label={`Question ${turn.id}`}>
          <p className="ws-chat-question"><strong>You</strong><span>{turn.question}</span></p>
          <div className="ws-chat-answer"><strong className="ws-chat-speaker">Boozer · local</strong>
            {turn.answer.status === 'running' && <p className="ws-chat-thinking" role="status">
              {turn.answer.text === '' ? 'Thinking…' : 'Replying…'}</p>}
            <ExplanationResult path={snippets[0]?.ref.file ?? ''} state={turn.answer} onSelect={onSelect} />
          </div>
        </article>;
      })}
    </div>
    <form className="ws-chat-compose" onSubmit={(event) => { event.preventDefault(); ask(); }}>
      {contextPath !== null && <label className="ws-chat-context"><input type="checkbox" checked={includeFile}
        onChange={(event) => setIncludeFile(event.target.checked)} /> Include selected file: <code>{contextPath}</code></label>}
      <label htmlFor="repo-question">Your question</label>
      <textarea id="repo-question" value={question} maxLength={CHAT_QUESTION_LIMIT} rows={3} disabled={running}
        placeholder="Ask about a file, symbol or how the repo works…" onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); ask(); } }} />
      <div className="ws-chat-actions"><span className="muted">{question.length}/{CHAT_QUESTION_LIMIT} · Ctrl/⌘ + Enter</span>
        {running ? <button type="button" onClick={chat.onCancel}>Cancel answer</button>
          : <button type="submit" disabled={question.trim() === ''}>Chat Boozer</button>}</div>
      {running && <p className="muted">Local replies can take up to six minutes. You can cancel.</p>}
      <p className="ws-chat-memory muted">Keeps the latest eight questions in this session. Clear or refresh to reset. Search can miss relevant code; try a file or symbol name.</p>
    </form>
  </section>;
}
