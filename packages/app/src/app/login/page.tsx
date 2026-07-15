'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/';

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, password }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Login failed');
        return;
      }
      router.push(redirect);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Viewport</h1>
      <label>
        <span style={{ fontSize: 13, color: '#666' }}>Your name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Alex"
          required
          autoFocus
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6 }}
        />
      </label>
      <label>
        <span style={{ fontSize: 13, color: '#666' }}>Team password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6 }}
        />
      </label>
      {error && <p style={{ color: '#c00', fontSize: 13 }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{ padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
