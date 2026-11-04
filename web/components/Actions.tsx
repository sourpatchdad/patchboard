// Start, stop and restart, with a two-step confirm inline: the first click
// arms the button ("Restart sonarr?"), the second sends it. The armed state
// times out after a few seconds so a stray click never lingers as a trap.

import { useEffect, useState } from 'react';

type Action = 'start' | 'stop' | 'restart';

const VERB: Record<Action, [string, string]> = {
  start: ['Start', 'Starting'],
  stop: ['Stop', 'Stopping'],
  restart: ['Restart', 'Restarting'],
};

export function ContainerActions({ name, running, self }: { name: string; running: boolean; self?: boolean }) {
  const [armed, setArmed] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  const run = async (action: Action) => {
    setArmed(null);
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(`/api/containers/${encodeURIComponent(name)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult({ ok: true, text: `${VERB[action][0]} sent.` });
    } catch (err) {
      // Restarting Patchboard itself drops this request; the page reconnects.
      if (self && action !== 'start') setResult({ ok: true, text: 'Patchboard is restarting. This page reconnects on its own.' });
      else setResult({ ok: false, text: `${VERB[action][0]} failed: ${(err as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const actions: Action[] = running ? ['restart', 'stop'] : ['start'];
  return (
    <div className="ctr-actions">
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          className={`button button-quiet ${armed === a ? 'is-armed' : ''} ${a === 'stop' ? 'is-danger' : ''}`}
          disabled={!!busy}
          onClick={() => (armed === a ? void run(a) : setArmed(a))}
          aria-live="polite"
        >
          {busy === a ? `${VERB[a][1]}...` : armed === a ? `${VERB[a][0]} ${name}?` : VERB[a][0]}
        </button>
      ))}
      {result && <span className={`ctr-actions-result ${result.ok ? '' : 'crit-text'}`}>{result.text}</span>}
    </div>
  );
}
