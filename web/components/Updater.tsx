// Update from the UI: a press-and-hold button, one notice when an update
// waits, a compact action for list rows, and a live panel that follows the
// job: pull, recreate, wait for healthy. Any update that changed the image,
// failed or not, offers the previous image back, and keeps offering it in
// one line after you dismiss the panel.

import { HoldButton } from './Hold.tsx';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UpdateJob } from '../../shared/types.ts';
import { agoLong, duration } from '../lib/format.ts';
import { useNow, useStore } from '../lib/store.tsx';
import { Section } from './ui.tsx';

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };

/** The newest job for this container, followed live while it runs. */
/** Jobs whose panel was dismissed, on this device: coming back shows the one line, not the panel again. */
const DISMISSED = 'pb-jobs-dismissed';
const dismissedJobs = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const rememberDismissed = (id: string) => {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([id, ...dismissedJobs().filter((x) => x !== id)].slice(0, 20)));
  } catch {
    // Private mode: it's dismissed for this visit.
  }
};

export function useUpdateJob(name: string) {
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [error, setError] = useState('');
  /** Dismissed: the panel goes, the job stays known so it can still be undone. */
  const [hidden, setHidden] = useState(false);

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
    setHidden(false);
    void (async () => {
      const j = (await (await fetch(`/api/containers/${encodeURIComponent(name)}/job`)).json()) as UpdateJob | null;
      if (!j) return;
      setJob(j);
      if (j.status === 'running') stop = follow(j.id);
      else if (dismissedJobs().includes(j.id)) setHidden(true);
    })();
    return () => stop?.();
  }, [name, follow]);

  const post = async (url: string) => {
    setError('');
    setHidden(false);
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
    job: hidden ? null : job,
    /** The newest job, shown or dismissed. */
    last: job,
    error,
    start: () => post(`/api/containers/${encodeURIComponent(name)}/update`),
    rollback: (id: string) => post(`/api/jobs/${id}/rollback`),
    dismiss: () => {
      if (job) rememberDismissed(job.id);
      setHidden(true);
    },
  };
}

/** An update that put a different image in place: the old one can come back. */
export const undoable = (j: UpdateJob | null | undefined): j is UpdateJob =>
  !!j && j.kind === 'update' && j.status !== 'running' && !!j.from && j.from !== j.to && j.steps.find((s) => s.key === 'recreate')?.status !== 'waiting';

/** After the panel is dismissed: one line that keeps the way back. */
export function UpdateUndo({ job, onRollback }: { job: UpdateJob | null; onRollback: (id: string) => void }) {
  const { snap } = useStore();
  const now = useNow(60_000);
  if (!undoable(job) || job.status !== 'done' || snap?.readOnly) return null;
  return (
    <p className="update-notice">
      Updated {agoLong(job.finishedAt ?? job.startedAt, now)} from <code>{job.from}</code>
      <HoldButton className="text-button" hint="Hold to roll back" label={`Roll back to ${job.from}`} onConfirm={() => onRollback(job.id)}>
        Roll back
      </HoldButton>
    </p>
  );
}

/** Update, as a press and hold: recreating takes the container down for a moment. It stands out when an update waits. */
/** `busy`: this update is running. `locked`: something else is (a start, a stop), so it waits without claiming to update. */
export function UpdateButton({ busy, busyLabel = 'Updating...', locked = false, onStart, waiting = false }: { name: string; busy: boolean; busyLabel?: string; locked?: boolean; onStart: () => void; waiting?: boolean }) {
  return (
    <HoldButton className={waiting ? 'button board-save' : 'button button-quiet'} disabled={busy || locked} hint="Hold to update" onConfirm={onStart}>
      {busy ? busyLabel : 'Update'}
    </HoldButton>
  );
}

/** One line under a container's state when it has an update waiting, or a newer copy already pulled. */
export function UpdateNotice({ name, stale, busy = false }: { name: string; stale?: boolean; busy?: boolean }) {
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
      {/* Not while an update runs: it would clear the mark mid-way. */}
      {!ro && !busy && (
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
      <p className={`update-summary ${job.status === 'failed' ? 'crit-text' : ''}`} role="status">{summary}</p>
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
        {/* Only once the container was recreated: a failed pull changed nothing.
            After a good update it's the quiet choice; after a failed one, the first. */}
        {undoable(job) && (
          <HoldButton className={job.status === 'failed' ? 'button' : 'button button-quiet'} hint="Hold to roll back" onConfirm={() => onRollback(job.id)}>
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

/** Update Patchboard itself: the same job as its container page, followed in one line. */
export function SelfUpdate({ name, waiting }: { name: string; waiting: boolean }) {
  const u = useUpdateJob(name);
  const j = u.job;
  if (j?.status === 'running') return <span>{j.steps.find((s) => s.status === 'running')?.label ?? 'Updating'}...</span>;
  if (j?.status === 'failed') return <Link to={`/c/${encodeURIComponent(name)}`} className="crit-text">Update failed. Open it</Link>;
  if (j?.status === 'done' && j.steps.find((s) => s.key === 'pull')?.note === 'Already the newest image') return <span>Already the newest image.</span>;
  return (
    <>
      <UpdateButton name={name} busy={false} waiting={waiting} onStart={() => void u.start()} />
      {u.error && <span className="crit-text" role="alert">{u.error}</span>}
    </>
  );
}
