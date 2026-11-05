import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { moodFor } from '../../shared/otter.ts';
import { setStatus } from '../lib/appearance.ts';
import { useStore } from '../lib/store.tsx';
import { Otter } from './Otter.tsx';
import { Palette } from './Palette.tsx';
import { SignIn } from '../views/SignIn.tsx';

// On a phone the tab bar holds the first five; Logs and Apps stay one search away.
// Phone tab bar icons: 24-unit outlines, drawn in the link's color.
const ICONS: Record<string, string> = {
  '/': 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  '/server': 'M5 4h14a1 1 0 0 1 1 1v5H4V5a1 1 0 0 1 1-1zM4 14h16v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 7h.01M8 17h.01',
  '/stacks': 'M12 3 21 8l-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  '/feeds': 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 19h.01',
  '/upcoming': 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
};

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/server', label: 'Server' },
  { to: '/stacks', label: 'Stacks' },
  { to: '/feeds', label: 'Feeds' },
  { to: '/upcoming', label: 'Upcoming' },
  { to: '/logs', label: 'Logs', desktop: true },
  { to: '/apps', label: 'Apps', desktop: true },
];

// "g" then a letter, as in Gmail and GitHub.
const GO: Record<string, [string, string]> = {
  h: ['/', 'Home'],
  s: ['/server', 'Server'],
  k: ['/stacks', 'Stacks'],
  f: ['/feeds', 'Feeds'],
  u: ['/upcoming', 'Upcoming'],
  l: ['/logs', 'Logs'],
  a: ['/apps', 'Apps'],
  ',': ['/settings', 'Settings'],
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function Shell() {
  const { snap, live, failed, auth } = useStore();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const navigate = useNavigate();
  const gAt = useRef(0);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // The otter follows the server: the header mark, the tab icon, the title
  // count and an installed app's badge. Quiet nights, it sleeps.
  const serious = snap?.alerts.filter((a) => a.level !== 'info') ?? [];
  const level = serious.some((a) => a.level === 'critical') ? 'critical' : serious.length ? 'warn' : null;
  const hour = new Date().getHours();
  const mood = moodFor(level, hour >= 23 || hour < 6);
  useEffect(() => {
    if (snap) setStatus(level, serious.length);
  }, [snap, level, serious.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setHelp(false);
      if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') {
        setHelp((h) => !h);
      } else if (e.key === 'g') {
        gAt.current = Date.now();
      } else if (Date.now() - gAt.current < 1200 && GO[e.key]) {
        gAt.current = 0;
        setHelp(false);
        navigate(GO[e.key][0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const locked = palette || help;
    document.documentElement.classList.toggle('is-locked', locked);
    return () => document.documentElement.classList.remove('is-locked');
  }, [palette, help]);

  const unreadFeeds = (snap?.sources.miniflux?.data as { unread: number } | null)?.unread ?? 0;

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="wordmark" aria-label="Patchboard home">
          <Otter mood={mood} size={28} tile className="wordmark-otter" />
          <span>Patchboard</span>
        </NavLink>
        <nav className="nav" aria-label="Views">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={`nav-link ${n.desktop ? 'nav-desktop' : ''}`}>
              {ICONS[n.to] && (
                <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[n.to]} />
                </svg>
              )}
              <span>{n.label}</span>
              {n.to === '/feeds' && unreadFeeds > 0 && <span className="nav-badge">{unreadFeeds}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-end">
          {snap?.demo && <span className="pill">Demo data</span>}
          {snap?.readOnly && (
            <span className="pill" title="READ_ONLY=1: nothing on this server can be changed from here">
              Read-only
            </span>
          )}
          <span className={`live ${live ? 'live-on' : ''}`} title={live ? 'Receiving live updates' : 'Reconnecting'}>
            {live ? 'Live' : failed ? 'Offline' : 'Connecting'}
          </span>
          <button type="button" className="topbar-icon topbar-search" aria-label="Jump to" onClick={() => setPalette(true)}>
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          </button>
          <NavLink to="/settings" className="topbar-icon" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </NavLink>
          <button type="button" className="jump" onClick={() => setPalette(true)}>
            <span>Jump to</span>
            <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        </div>
      </header>

      <main className="main">
        {auth && !snap ? (
          <SignIn mode={auth} />
        ) : failed && !snap ? (
          <div className="fatal">
            <h1>Can't reach the Patchboard server</h1>
            <p>The page loaded, but /api/snapshot didn't answer. Check that the container is running, then reload.</p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <button type="button" className="fab" aria-label="Jump to" onClick={() => setPalette(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <circle cx="11" cy="11" r="6.5" fill="none" strokeWidth="2" />
          <path d="M16 16l4 4" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <Palette open={palette} onClose={() => setPalette(false)} />
      {help && (
        <div className="palette-backdrop" onClick={() => setHelp(false)}>
          <div className="palette shortcuts" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <h2>Keyboard</h2>
            <dl>
              <div><dt><kbd>{mac ? '⌘' : 'Ctrl'} K</kbd> <kbd>/</kbd></dt><dd>Jump to anything</dd></div>
              {Object.entries(GO).map(([k, [, label]]) => (
                <div key={k}><dt><kbd>g</kbd> <kbd>{k}</kbd></dt><dd>{label}</dd></div>
              ))}
              <div><dt><kbd>j</kbd> <kbd>k</kbd> <kbd>o</kbd> <kbd>u</kbd></dt><dd>Feeds: next, previous, open, back to the list</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>This list</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
