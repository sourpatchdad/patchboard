import { useModal } from '../lib/modal.ts';
import { count } from '../lib/format.ts';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { moodFor } from '../../shared/otter.ts';
import { setAppName, setStatus } from '../lib/appearance.ts';
import { PullRefresh } from './PullRefresh.tsx';
import { useStore } from '../lib/store.tsx';
import { Otter } from './Otter.tsx';
import { Palette } from './Palette.tsx';
import { SignIn } from '../views/SignIn.tsx';
import { HELP } from '../lib/docs.ts';

// On a phone the tab bar holds Home, Server, Stacks, then Reading once
// Miniflux is set up (Upcoming until then), and More: every other page and
// Settings, one tap away.
// Phone tab bar icons: 24-unit outlines, drawn in the link's color.
const ICONS: Record<string, string> = {
  '/': 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  '/server': 'M5 4h14a1 1 0 0 1 1 1v5H4V5a1 1 0 0 1 1-1zM4 14h16v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 7h.01M8 17h.01',
  '/stacks': 'M12 3 21 8l-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  '/feeds': 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 19h.01',
  '/upcoming': 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  '/apps': 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/server', label: 'Server' },
  { to: '/stacks', label: 'Stacks' },
  { to: '/feeds', label: 'Reading' },
  { to: '/upcoming', label: 'Upcoming' },
  { to: '/logs', label: 'Logs', desktop: true },
  { to: '/apps', label: 'Apps', desktop: true },
];

// "g" then a letter, as in Gmail and GitHub.
const GO: Record<string, [string, string]> = {
  h: ['/', 'Home'],
  s: ['/server', 'Server'],
  k: ['/stacks', 'Stacks'],
  f: ['/feeds', 'Reading'],
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [help, setHelp] = useState(false);
  // Every board counts as Home in the nav.
  const location = useLocation();
  const onBoard = location.pathname.startsWith('/b/');
  const navigate = useNavigate();
  const gAt = useRef(0);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // The otter follows the server: the header mark, the tab icon, the title
  // count and an installed app's badge. Quiet nights, it sleeps.
  const serious = snap?.alerts.filter((a) => a.level !== 'info') ?? [];
  const level = serious.some((a) => a.level === 'critical') ? 'critical' : serious.length ? 'warn' : null;
  const hour = new Date().getHours();
  const notes = snap?.alerts.filter((a) => a.level === 'info').length ?? 0;
  const mood = moodFor(level, hour >= 23 || hour < 6, notes);
  useEffect(() => {
    if (snap) setStatus(level, serious.length);
  }, [snap, level, serious.length]);
  const name = snap?.brand?.name || 'Patchboard';
  useEffect(() => setAppName(name), [name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modal = document.querySelector('[aria-modal="true"]');
      if (modal && modal.getAttribute('aria-label') !== 'Jump to') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
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

  const unreadFeeds = (snap?.sources.miniflux?.data as { unread: number } | null)?.unread ?? 0;
  const reading = !!snap?.sources.miniflux || !!snap?.demo;
  const phoneTabs = ['/', '/server', '/stacks', reading ? '/feeds' : '/upcoming'];
  const more: { to: string; label: string }[] = [...NAV.filter((n) => !phoneTabs.includes(n.to)), { to: '/weather', label: 'Weather' }, { to: '/settings', label: 'Settings' }];
  const inMore = more.some((m) => location.pathname === m.to || location.pathname.startsWith(`${m.to}/`));

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <PullRefresh />
      <header className="topbar">
        <NavLink to="/" className="wordmark" aria-label={`${name}, home`}>
          {snap?.brand?.otter === true && <Otter mood={mood} size={32} mark className="wordmark-otter" />}
          <span title={name}>{name}</span>
        </NavLink>
        <nav className="nav" aria-label="Views">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-link ${phoneTabs.includes(n.to) ? '' : 'nav-desktop'} ${isActive || (n.to === '/' && onBoard) ? 'active' : ''}`}
            >
              {ICONS[n.to] && (
                <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[n.to]} />
                </svg>
              )}
              <span>{n.label}</span>
              {n.to === '/feeds' && unreadFeeds > 0 && <span className="nav-badge">{count(unreadFeeds)}</span>}
            </NavLink>
          ))}
          <button type="button" className={`nav-link nav-more ${inMore ? 'active' : ''}`} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
            <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d={ICONS.more} />
            </svg>
            <span>More</span>
          </button>
        </nav>
        <div className="topbar-end">
          {snap?.demo && <span className="pill demo-pill">Demo data</span>}
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
          <NavLink to="/settings" className="topbar-icon topbar-settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            <span className="topbar-label" aria-hidden>Settings</span>
          </NavLink>
          <button type="button" className="jump" onClick={() => setPalette(true)}>
            <span>Jump to</span>
            <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        </div>
      </header>

      <main className="main" id="main-content" tabIndex={-1}>
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

      <Palette open={palette} onClose={() => setPalette(false)} onKeys={() => (setPalette(false), setHelp(true))} />
      {moreOpen && <MoreSheet items={more} unread={unreadFeeds} onJump={() => (setMoreOpen(false), setPalette(true))} onClose={() => setMoreOpen(false)} />}
      {help && <KeyboardHelp mac={mac} onClose={() => setHelp(false)} />}
    </div>
  );
}

/** The phone's More tab: every page the tab bar has no room for, and Settings. */
function MoreSheet({ items, unread, onJump, onClose }: { items: { to: string; label: string }[]; unread: number; onJump: () => void; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="palette-backdrop more-backdrop" onClick={onClose}>
      <div className="more-sheet" ref={modal} role="dialog" aria-label="More pages" onClick={(e) => e.stopPropagation()}>
        <nav aria-label="More pages">
          {items.map((m) => (
            <NavLink key={m.to} to={m.to} className="more-link" onClick={onClose}>
              <span>{m.label}</span>
              {m.to === '/feeds' && unread > 0 && <span className="nav-badge">{count(unread)}</span>}
            </NavLink>
          ))}
          <button type="button" className="more-link" onClick={onJump}>
            <span>Jump to anything</span>
          </button>
          <a className="more-link" href={HELP.tour} target="_blank" rel="noreferrer" onClick={onClose}>
            <span>Help</span>
          </a>
        </nav>
        <button type="button" className="button more-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function KeyboardHelp({ mac, onClose }: { mac: boolean; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette shortcuts" ref={modal} onKeyDown={(e) => { if (e.key === '?') { e.preventDefault(); e.stopPropagation(); onClose(); } }} role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head"><h2>Keyboard</h2><button type="button" className="text-button" onClick={onClose}>Close</button></header>
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
  );
}
