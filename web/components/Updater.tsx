// Update from the UI: a button (two-step confirm, like the other actions) and
// a live panel that follows the job: pull, recreate, wait for healthy. A
// failed update offers the previous image back.

import { HoldButton } from './Hold.tsx';
import { useCallback, useEffect, useState } from 'react';
import type { UpdateJob } from '../../shared/types.ts';
import { duration } from '../lib/format.ts';
import { Section } from './ui.tsx';

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };

/** The newest job for this container, followed live while it runs. */
export function useUpdateJob(name: string) {
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [error, setError] = useState('');

  const follow = useCallback((id: string) => {
    const es = new EventSource(`/api/jobs/${id}`);
    es.onmessage = (m) => {
      const j = JSON.parse(m.data as string) as UpdateJob;
      setJob(j);
      if (j.status !== 'running') es.close();
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    setJob(null);
    void (async () => {
      const j = (await (await fetch(`/api/containers/${encodeURIComponent(name)}/job`)).json()) as UpdateJob | null;
      if (!j) return;
      setJob(j);
      if (j.status === 'running') stop = follow(j.id);
    })();
    return () => stop?.();
  }, [name, follow]);

  const post = async (url: string) => {
    setError('');
    const res = await fetch(url, { method: 'POST', headers: ACTION });
    const body = (await res.json()) as UpdateJob & { error?: string };
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setJob(body);
    follow(body.id);
  };

  return {
    job,
    error,
    start: () => post(`/api/containers/${encodeURIComponent(name)}/update`),
    rollback: (id: string) => post(`/api/jobs/${id}/rollback`),
    dismiss: () => setJob(null),
  };
}

export function UpdateButton({ busy, onStart }: { name: string; busy: boolean; onStart: () => void }) {
  // Recreating the container takes it down for a moment, so it's a press and hold.
  return (
    <HoldButton disabled={busy} hint="Hold to update" onConfirm={onStart}>
      {busy ? 'Updating...' : 'Update'}
    </HoldButton>
  );
}

const MARK: Record<string, string> = { waiting: '', running: '', done: '✓', failed: '✕', skipped: '–' };

export function UpdatePanel({ job, error, onRollback, onDismiss }: { job: UpdateJob | null; error: string; onRollback: (id: string) => void; onDismiss: () => void }) {
  if (!job && !error) return null;
  if (!job) {
    return (
      <Section title="Update" className="update-panel">
        <p className="crit-text update-error">{error}</p>
      </Section>
    );
  }
  const title = job.kind === 'rollback' ? 'Rollback' : 'Update';
  const took = job.finishedAt ? duration(job.finishedAt - job.startedAt) : '';
  const summary =
    job.status === 'running'
      ? `${job.kind === 'rollback' ? 'Rolling back' : 'Updating'}...`
      : job.status === 'done'
        ? job.from === job.to
          ? `Already up to date. Checked in ${took}.`
          : `${job.kind === 'rollback' ? 'Rolled back' : 'Updated'} in ${took}.`
        : `${title} failed: ${job.error ?? 'unknown error'}`;

  return (
    <Section title={title} className={`update-panel is-${job.status}`} count={job.from && job.to && job.from !== job.to ? `${job.from} → ${job.to}` : undefined}>
      <p className={`update-summary ${job.status === 'failed' ? 'crit-text' : ''}`}>{summary}</p>
      <ol className="update-steps">
        {job.steps.map((s) => (
          <li key={s.key} data-status={s.status}>
            <span className="update-mark" aria-hidden>
              {MARK[s.status]}
            </span>
            <span className="update-label">{s.label}</span>
            {s.note && <span className="update-note-text">{s.note}</span>}
          </li>
        ))}
      </ol>
      {job.log.length > 0 && (
        <details className="update-log" open={job.status === 'failed'}>
          <summary>Output</summary>
          <div className="logs-out wrap">
            {job.log.map((l, i) => (
              <div key={i} className="ll">
                {l}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="update-foot">
        {/* Only once the container was recreated: a failed pull changed nothing. */}
        {job.status === 'failed' && job.kind === 'update' && job.from && job.steps.find((s) => s.key === 'recreate')?.status !== 'waiting' && (
          <HoldButton hint="Hold to roll back" onConfirm={() => onRollback(job.id)}>
            {`Roll back to ${job.from}`}
          </HoldButton>
        )}
        {job.status !== 'running' && (
          <button type="button" className="text-button" onClick={onDismiss}>
            Dismiss
          </button>
        )}
        {error && <span className="crit-text">{error}</span>}
      </div>
    </Section>
  );
}
