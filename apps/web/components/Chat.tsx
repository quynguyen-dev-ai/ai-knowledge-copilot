'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, askStream, Source } from '@/lib/api';

interface Message {
  role: 'USER' | 'ASSISTANT';
  content: string;
  sources?: Source[] | null;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    api<Message[]>('/chat/history').then(setMessages).catch(() => undefined);
  }, []);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const updateLast = (fn: (m: Message) => Message) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || streaming) return;
    setInput('');
    setStreaming(true);
    setMessages((ms) => [...ms, { role: 'USER', content: question }, { role: 'ASSISTANT', content: '' }]);
    abort.current = new AbortController();
    try {
      await askStream(
        question,
        {
          sources: (sources) => updateLast((m) => ({ ...m, sources })),
          token: (t) => updateLast((m) => ({ ...m, content: m.content + t })),
          error: (msg) => updateLast((m) => ({ ...m, content: `⚠️ ${msg}` })),
        },
        abort.current.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') updateLast((m) => ({ ...m, content: '⚠️ Something went wrong.' }));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8">
        {messages.length === 0 && (
          <div className="mx-auto mt-24 max-w-md text-center text-stone-500">
            <p className="text-lg font-medium text-stone-800">Ask anything about your documents</p>
            <p className="mt-2 text-sm">Answers come only from what you upload, with numbered citations you can check.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'USER' ? 'flex justify-end' : ''}>
            <div
              className={
                m.role === 'USER'
                  ? 'max-w-[80%] rounded-2xl bg-stone-900 px-4 py-2.5 text-white'
                  : 'max-w-3xl whitespace-pre-wrap leading-relaxed'
              }
            >
              {m.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse">▍</span> : null)}
              {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="border-t border-stone-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What is our remote work policy?"
            className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 outline-none focus:border-stone-900"
          />
          {streaming ? (
            <button type="button" onClick={() => abort.current?.abort()} className="rounded-xl border px-4 text-sm">
              Stop
            </button>
          ) : (
            <button className="rounded-xl bg-stone-900 px-5 text-sm font-medium text-white">Ask</button>
          )}
        </div>
      </form>
    </section>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <details className="mt-3 text-sm text-stone-600">
      <summary className="cursor-pointer select-none text-stone-500">{sources.length} sources</summary>
      <ol className="mt-2 space-y-2">
        {sources.map((s) => (
          <li key={s.n} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="mb-1 flex justify-between text-xs text-stone-500">
              <span>
                [{s.n}] {s.metadata.filename ?? s.document_id} · chunk {s.chunk}
              </span>
              <span>relevance {s.score.toFixed(2)}</span>
            </div>
            <p className="line-clamp-3">{s.text}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
