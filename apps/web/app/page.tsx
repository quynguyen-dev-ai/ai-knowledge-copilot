'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chat } from '@/components/Chat';
import { DocumentPanel } from '@/components/DocumentPanel';
import { token } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token.get()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <span className="font-semibold">Knowledge Copilot</span>
        <button
          onClick={() => {
            token.clear();
            router.replace('/login');
          }}
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          Sign out
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <DocumentPanel />
        <Chat />
      </div>
    </div>
  );
}
