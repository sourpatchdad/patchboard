import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SourceState } from '../../shared/types.ts';
import { ago } from '../lib/format.ts';
import { iconUrl } from '../lib/services.ts';

export function Section(props: {
  title: string;
  count?: ReactNode;
  action?: { label: string; to?: string; href?: string };
  source?: SourceState;
  className?: string;
  children: ReactNode;
}) {
  const { title, count, action, source, className, children } = props;
  return (
    <section className={`section ${className ?? ''}`}>
      <header className="section-head">
        <h2>{title}</h2>
        {count != null && <span className="section-count">{count}</span>}
        {source && !source.ok && source.error && (
          <span className="section-stale" title={source.error}>
            {source.updatedAt ? `Stale, last updated ${ago(source.updatedAt)}` : 'Not reachable'}
          </span>
        )}
        {action &&
          (action.to ? (
            <Link className="section-action" to={action.to}>
              {action.label}
            </Link>
          ) : (
            <a className="section-action" href={action.href} target="_blank" rel="noreferrer">
              {action.label}
            </a>
          ))}
      </header>
      {children}
    </section>
  );
}

/** Mono is the label layer: identifiers like container names get it. */
export function Ident({ children }: { children: ReactNode }) {
  return <code className="ident">{children}</code>;
}

/** "S02E06 Dead Reckoning": the episode code in mono, the title in the body face. */
export function Episode({ text }: { text?: string }) {
  const m = /^(S\d+E\d+)\s*(.*)$/.exec(text ?? '');
  if (!m) return <>{text}</>;
  return (
    <>
      <code className="ep">{m[1]}</code>
      {m[2] ? ` ${m[2]}` : ''}
    </>
  );
}

/** Render "unpackerr is not running" with the leading identifier in mono. */
export function WithSubject({ title, subject }: { title: string; subject?: string }) {
  if (!subject || !title.startsWith(subject)) return <>{title}</>;
  return (
    <>
      <Ident>{subject}</Ident>
      {title.slice(subject.length)}
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Service icon with a monogram fallback when the CDN has nothing. */
export function Icon({ name, icon, size = 22 }: { name: string; icon?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = iconUrl(icon);
  if (!src || broken) {
    return (
      <span className="icon-mono" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className="icon-img"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

// Muted slates and earths around the nbnstack slate (#304251).
const POSTER_TONES = ['#304251', '#3c3846', '#2d453f', '#4a3e31', '#283a48', '#45373b', '#384132'];

/** Plex poster, or a typographic stand-in built from the title. */
export function Poster({ title, thumb }: { title: string; thumb?: string }) {
  const [broken, setBroken] = useState(false);
  if (thumb && !broken) {
    return <img className="poster" src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (
    <div className="poster poster-type" style={{ background: POSTER_TONES[Math.abs(h) % POSTER_TONES.length] }} aria-hidden>
      <span>{title}</span>
    </div>
  );
}

export function Meter({ value, level }: { value: number; level?: 'ok' | 'warn' | 'crit' }) {
  return (
    <span className={`meter meter-${level ?? 'ok'}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}
