export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'copilot.token';

export const token = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = token.get();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  if (res.status === 401) token.clear();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, msg ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface Source {
  n: number;
  document_id: string;
  chunk: number;
  score: number;
  text: string;
  metadata: { filename?: string };
}

export interface DocumentItem {
  id: string;
  filename: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  chunks: number;
  sizeBytes: number;
  createdAt: string;
}

/** POSTs a question and invokes callbacks as Server-Sent Events arrive. */
export async function askStream(
  question: string,
  on: { sources: (s: Source[]) => void; token: (t: string) => void; error: (m: string) => void },
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_URL}/api/chat/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.get()}` },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, 'Request failed');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || data === undefined) continue;
      if (event === 'sources') on.sources(JSON.parse(data));
      else if (event === 'token') on.token(JSON.parse(data));
      else if (event === 'error') on.error(JSON.parse(data));
    }
  }
}
