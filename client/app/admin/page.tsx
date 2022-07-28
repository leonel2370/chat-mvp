'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

type Session = {
  aId: string;
  bId: string;
  a: string;
  b: string;
  startedAt: number;
};

type Report = {
  id: string;
  reporter: string;
  reported: string;
  reportedId: string;
  reason: string;
  at: number;
};

type Stats = {
  online: number;
  queue: number;
  sessions: Session[];
  reports: Report[];
};

const emptyStats: Stats = { online: 0, queue: 0, sessions: [], reports: [] };

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [stats, setStats] = useState<Stats>(emptyStats);
  // Horloge courante (0 avant le premier tick, mise à jour chaque seconde)
  const [now, setNow] = useState(0);

  const socketRef = useRef<Socket | null>(null);

  // Horloge pour rafraîchir les durées
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const sock = socketRef.current;
    if (!sock) return;

    sock.on('admin-stats', (data: Stats) => setStats(data));

    return () => {
      sock.off('admin-stats');
    };
  }, [authed]);

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const sock = io(SOCKET_SERVER_URL);
    socketRef.current = sock;
    sock.emit('admin-auth', password, (res: { ok: boolean; locked?: boolean }) => {
      if (res?.ok) {
        setAuthed(true);
      } else {
        setAuthError(res?.locked ? 'Too many attempts. Try again later.' : 'Incorrect password.');
        sock.disconnect();
        socketRef.current = null;
      }
    });
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-white text-ink flex items-center justify-center px-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-xl border border-line p-8">
          <h1 className="text-xl font-medium">Moderator dashboard</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to monitor live activity.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mt-5 h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-primary"
          />
          {authError && <p className="mt-2 text-sm text-danger">{authError}</p>}
          <button
            type="submit"
            className="mt-4 h-10 w-full rounded-full bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-line">
        <span className="text-[22px] text-ink-muted">CHAT · Moderation</span>
        <span className="flex items-center gap-2 rounded-full border border-line px-3 h-8 text-sm text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-success" />
          Live
        </span>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-8">
        {/* Indicateurs */}
        <section className="grid grid-cols-3 gap-4">
          {[
            { label: 'Online', value: stats.online },
            { label: 'Active calls', value: stats.sessions.length },
            { label: 'In queue', value: stats.queue }
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-line p-5">
              <p className="text-sm text-ink-muted">{card.label}</p>
              <p className="mt-1 text-3xl font-medium">{card.value}</p>
            </div>
          ))}
        </section>

        {/* Sessions en cours */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-muted">Active calls</h2>
          {stats.sessions.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-ink-muted">
              No active call.
            </p>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line">
              {stats.sessions.map((s) => (
                <div key={s.aId + s.bId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {s.a} ↔ {s.b}
                  </span>
                  <span className="text-ink-muted">{formatDuration(now - s.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Signalements */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-muted">Reports</h2>
          {stats.reports.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-ink-muted">
              No report.
            </p>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line">
              {stats.reports.map((r) => (
                <div key={r.id} className="px-4 py-3 text-sm">
                  <span className="font-medium text-danger">{r.reported}</span>
                  <span className="text-ink-muted"> reported by {r.reporter}</span>
                  {r.reason && <span className="text-ink-muted"> — {r.reason}</span>}
                  <span className="ml-2 text-ink-muted">{new Date(r.at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
