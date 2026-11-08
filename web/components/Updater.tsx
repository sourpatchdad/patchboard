// Update from the UI: a press-and-hold button, one notice when an update
// waits, a compact action for list rows, and a live panel that follows the
// job: pull, recreate, wait for healthy. A failed update offers the previous
// image back.

import { HoldButton } from './Hold.tsx';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UpdateJob } from '../../shared/types.ts';
import { agoLong, duration } from '../lib/format.ts';
import { useNow, useStore } from '../lib/store.tsx';
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

/** Update, as a press and hold: recreating takes the container down for a moment. It stands out when an update waits. */
export function UpdateButton({ busy, onStart, waiting = false }: { name: string; busy: boolean; onStart: () => void; waiting?: boolean }) {
  return (
    <HoldButton className={waiting ? 'button board-save' : 'button button-quiet'} disabled={busy} hint="Hold to update" onConfirm={onStart}>
      {busy ? 'Updating...' : 'Update'}
    </HoldButton>
  );
}

/** One line under a container's state when it has an update waiting, or a newer copy already pulled. */
export function UpdateNotice({ name, stale }: { name: string; stale?: boolean }) {
  const { snap } = useStore();
  const now = useNow(60_000);
  const u = snap?.updates[name];
  const ro = !!snap?.readOnly;
  if (stale) return <p className="update-notice">A newer copy is downloaded and this container still runs the old one.{!ro && ' Update switches it over.'}</p>;
  if (!u) return null;
  return (
    <p className="update-notice">
      Update available, found {agoLong(u.at, now)}.
      {u.link && u.link !== '#' && (
        <a href={u.link} target="_blank" rel="noreferrer">
          What changed
        </a>
      )}
      {!ro && (
        <button
          type="button"
          className="text-button"
          title="Clear the mark if you already run the newest image"
          onClick={() => void fetch(`/api/updates/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { 'X-Patchboard': 'action' } })}
        >
          Dismiss
        </button>
      )}
    </p>
  );
}

/** Update from a list row: the button, then the step it's on, then how it ended. */
export function RowUpdate({ name }: { name: string }) {
  const u = useUpdateJob(name);
  const j = u.job;
  if (j?.status === 'running') return <span className="row-update-note">{j.steps.find((s) => s.status === 'running')?.label ?? 'Updating'}...</span>;
  if (j?.status === 'done') return <span className="row-update-note ok-text">Updated</span>;
  if (j?.status === 'failed')
    return (
      <Link to={`/c/${encodeURIComponent(name)}`} className="row-update-note crit-text">
        Failed. Open it
      </Link>
    );
  return (
    <>
      {u.error && (
        <Link to={`/c/${encodeURIComponent(name)}`} className="row-update-note crit-text" title={u.error}>
          Can't update here
        </Link>
      )}
      <UpdateButton name={name} busy={false} waiting onStart={() => void u.start()} />
    </>
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
