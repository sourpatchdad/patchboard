import { useContext } from 'react';
import { WidgetCtx } from '../board/widget-context.ts';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SourceState } from '../../shared/types.ts';
import { INTEGRATIONS } from '../../shared/integrations.ts';
import { ago } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import { iconUrl } from '../lib/services.ts';
import { t } from '../lib/i18n.ts';

export function Section(props: {
  title: string;
  count?: ReactNode;
  action?: { label: string; to?: string; href?: string; onClick?: () => void };
  source?: SourceState;
  className?: string;
  /** An anchor, so a link elsewhere can land on this section. */
  id?: string;
  children: ReactNode;
}) {
  const { count, action, source, className, children, id } = props;
  // Inside a Home widget, the widget's own name (if someone renamed it) wins.
  const widget = useContext(WidgetCtx);
  const title = widget?.title || t(props.title);
  const { live, failed } = useStore();
  // On the board every widget wears a light: its integration's health, or,
  // for one built from several, whether Patchboard itself is live.
  const led: { state: LedState; label: string } | null = source
    ? { state: source.ok ? 'ok' : source.updatedAt ? 'warn' : 'crit', label: INTEGRATIONS.find((i) => i.id === source.id)?.name ?? source.label }
    : widget
      ? { state: live ? 'ok' : failed ? 'crit' : 'warn', label: 'Patchboard' }
      : null;
  return (
    <section className={`section ${className ?? ''}`} id={id}>
      <header className="section-head">
        {led && <Led state={led.state} label={led.label} />}
        <h2>{title}</h2>
        {count != null && <span className="section-count">{count}</span>}
        {source && !source.ok && source.error && (
          <span className="section-stale">{source.updatedAt ? `Stale, last updated ${ago(source.updatedAt)}` : 'Not reachable'}</span>
        )}
        {action &&
          (action.onClick ? (
            <button type="button" className="section-action text-button" onClick={action.onClick}>
              {t(action.label)}
            </button>
          ) : action.to ? (
            <Link className="section-action" to={action.to}>
              {t(action.label)}
            </Link>
          ) : (
            <a className="section-action" href={action.href} target="_blank" rel="noreferrer">
              {t(action.label)}
            </a>
          ))}
      </header>
      {/* What broke, in words a phone can read, and the way to fix it. */}
      {source && !source.ok && source.error && (
        <p className="section-error">
          {INTEGRATIONS.find((i) => i.id === source.id)?.name ?? source.label}: {source.error.replace(/\.$/, '')}.{' '}
          <Link to={`/settings?tab=connections&setup=${encodeURIComponent(source.id)}`}>Check the connection</Link>
        </p>
      )}
      {children}
    </section>
  );
}

export type LedState = 'ok' | 'warn' | 'crit' | 'idle';

const LED_WORDS: Record<LedState, string> = { ok: 'live', warn: 'stale', crit: 'not reachable', idle: 'idle' };

/**
 * A light in a patch-panel socket: a quiet glow while live, amber when
 * stale, red when down, dark when idle. The one status mark across Patchboard.
 */
export function Led({ state, label }: { state: LedState; label?: string }) {
  return label ? <span className="led" data-state={state} role="img" aria-label={`${label}: ${LED_WORDS[state]}`} /> : <span className="led" data-state={state} aria-hidden />;
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
      <span className="icon-mono" style={{ width: size, height: size, fontSize: Math.max(11, size * 0.5) }} aria-hidden>
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

// Muted slates and earths for posters without art.
const POSTER_TONES = ['#304251', '#3c3846', '#2d453f', '#4a3e31', '#283a48', '#45373b', '#384132'];

/** Plex poster, or a typographic stand-in built from the title. */
export function Poster({ title, thumb, small = false }: { title: string; thumb?: string; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (thumb && !broken) {
    return <img className="poster" src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) | 0;
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  return (
    <div className={`poster poster-type ${small ? 'poster-small' : ''}`} style={{ background: POSTER_TONES[Math.abs(h) % POSTER_TONES.length] }} aria-hidden>
      {/* Long words get a smaller size so they fit whole instead of breaking mid-word. */}
      <span style={small ? undefined : { fontSize: longest > 10 ? 14 : longest > 8 ? 16 : undefined }}>
        {small
          ? title
              .replace(/^(the|a|an)\s+/i, '')
              .split(/\s+/)
              .filter((w) => /^[\p{L}\p{N}]/u.test(w))
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join('')
          : title}
      </span>
    </div>
  );
}

export function Meter({ value, level, label }: { value: number; level?: 'ok' | 'warn' | 'crit'; label: string }) {
  return (
    <span className={`meter meter-${level ?? 'ok'}`} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}
