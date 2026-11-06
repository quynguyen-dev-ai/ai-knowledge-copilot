'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, token } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { accessToken } = await api<{ accessToken: string }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      token.set(accessToken);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Knowledge Copilot</h1>
          <p className="mt-1 text-sm text-stone-500">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your private workspace'}
          </p>
        </div>
        {mode === 'register' && <Field name="name" label="Name" autoComplete="name" />}
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field name="password" label="Password" type="password" minLength={8} autoComplete="current-password" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="w-full text-sm text-stone-500 hover:text-stone-900"
        >
          {mode === 'login' ? 'No account? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="text-stone-600">{label}</span>
      <input
        required
        {...props}
        className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
      />
    </label>
  );
}
