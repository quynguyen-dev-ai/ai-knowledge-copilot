'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DocumentItem } from '@/lib/api';

const STATUS_STYLE: Record<DocumentItem['status'], string> = {
  READY: 'bg-emerald-100 text-emerald-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-red-100 text-red-800',
};

export function DocumentPanel() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api<DocumentItem[]>('/documents').then(setDocs).catch(() => undefined), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while anything is still being indexed.
  useEffect(() => {
    if (!docs.some((d) => d.status === 'PROCESSING')) return;
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [docs, refresh]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        await api('/documents', { method: 'POST', body });
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: string) {
    setDocs((d) => d.filter((x) => x.id !== id));
    await api(`/documents/${id}`, { method: 'DELETE' }).catch(refresh);
  }

  return (
    <aside className="flex w-full flex-col gap-3 border-stone-200 p-4 md:w-80 md:border-r">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Documents</h2>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 hover:border-stone-500"
      >
        {uploading ? 'Uploading…' : 'Drop PDF, TXT or Markdown here, or click to browse'}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2 overflow-y-auto">
        {docs.map((d) => (
          <li key={d.id} className="group flex items-center gap-2 rounded-lg bg-white p-2.5 text-sm shadow-sm">
            <span className="min-w-0 flex-1 truncate" title={d.filename}>
              {d.filename}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[d.status]}`}>
              {d.status === 'READY' ? `${d.chunks} chunks` : d.status.toLowerCase()}
            </span>
            <button
              onClick={() => void remove(d.id)}
              aria-label={`Delete ${d.filename}`}
              className="text-stone-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
            >
              ✕
            </button>
          </li>
        ))}
        {docs.length === 0 && <li className="text-sm text-stone-400">No documents yet.</li>}
      </ul>
    </aside>
  );
}
