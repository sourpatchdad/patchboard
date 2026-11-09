// Start, stop and restart. Stop and restart take a press and hold, so a
// stray click or a pocket tap can't take an app down; start is one click.

import { useEffect, useState } from 'react';
import { HoldButton } from './Hold.tsx';

export type Action = 'start' | 'stop' | 'restart';

export const VERB: Record<Action, [string, string]> = {
  start: ['Start', 'Starting'],
  stop: ['Stop', 'Stopping'],
  restart: ['Restart', 'Restarting'],
};

export function ContainerActions({ name, running, self, onSent }: { name: string; running: boolean; self?: boolean; onSent?: (action: Action) => void }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  const run = async (action: Action) => {
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
      if (onSent) onSent(action);
      else setResult({ ok: true, text: `${VERB[action][0]} sent.` });
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
      {actions.map((a) =>
        a === 'start' ? (
          <button key={a} type="button" className="button button-quiet" disabled={!!busy} onClick={() => void run(a)} aria-live="polite">
            {busy === a ? `${VERB[a][1]}...` : VERB[a][0]}
          </button>
        ) : (
          <HoldButton key={a} danger={a === 'stop'} disabled={!!busy} hint={`Hold to ${VERB[a][0].toLowerCase()}`} onConfirm={() => void run(a)}>
            {busy === a ? `${VERB[a][1]}...` : VERB[a][0]}
          </HoldButton>
        ),
      )}
      {result && <span className={`ctr-actions-result ${result.ok ? '' : 'crit-text'}`}>{result.text}</span>}
    </div>
  );
}
