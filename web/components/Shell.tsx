import { useModal } from '../lib/modal.ts';
import { count } from '../lib/format.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { setAppName, setIconVersion, setPageName, setStatus, getAppearance } from '../lib/appearance.ts';
import { PullRefresh } from './PullRefresh.tsx';
import { useStore } from '../lib/store.tsx';
import { Palette } from './Palette.tsx';
import { SignIn } from '../views/SignIn.tsx';
import { HELP } from '../lib/docs.ts';
import { appUrl, ideaUrl, problemUrl } from '../lib/feedback.ts';
import { needsYou } from '../lib/attention.ts';
import { serviceFor } from '../lib/services.ts';
import { useFollowOpens, useNightDim } from '../lib/household.ts';
import { WallPages } from './WallPages.tsx';
import { t } from '../lib/i18n.ts';
import { anyOn, PAGE_SOURCES } from '../../shared/feeds.ts';
import type { Snapshot } from '../../shared/types.ts';

// On a phone the tab bar holds Home, Server, Stacks, then Reading once
// Miniflux is set up (Upcoming until then), and More: every other page and
// Settings, one tap away.
// Phone tab bar icons: 24-unit outlines, drawn in the link's color.
const ICONS: Record<string, string> = {
  '/': 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  '/server': 'M5 4h14a1 1 0 0 1 1 1v5H4V5a1 1 0 0 1 1-1zM4 14h16v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 7h.01M8 17h.01',
  '/stacks': 'M12 3 21 8l-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  '/reading': 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 19h.01',
  '/upcoming': 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  '/apps': 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/server', label: 'Server' },
  { to: '/stacks', label: 'Stacks' },
  { to: '/reading', label: 'Reading' },
  { to: '/upcoming', label: 'Upcoming' },
  { to: '/logs', label: 'Logs', desktop: true },
  { to: '/apps', label: 'Apps', desktop: true },
  { to: '/media', label: 'Media', desktop: true },
  { to: '/downloads', label: 'Downloads', desktop: true },
  { to: '/library', label: 'Library', desktop: true },
  { to: '/requests', label: 'Requests', desktop: true },
  { to: '/blocking', label: 'Ad blocking', desktop: true },
];

// "g" then a letter, as in Gmail and GitHub.
const GO: Record<string, [string, string]> = {
  h: ['/', 'Home'],
  s: ['/server', 'Server'],
  k: ['/stacks', 'Stacks'],
  f: ['/reading', 'Reading'],
  u: ['/upcoming', 'Upcoming'],
  l: ['/logs', 'Logs'],
  a: ['/apps', 'Apps'],
  ',': ['/settings', 'Settings'],
};

// Pages for whoever runs the server. A household device doesn't see them;
// it does see Server, which only shows how things stand.
const ADMIN = ['/stacks', '/logs', '/apps', '/settings', '/c', '/downloads', '/library', '/requests', '/media', '/blocking'];
export const adminPage = (path: string) => ADMIN.some((a) => path === a || path.startsWith(`${a}/`));

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function Shell() {
  const { snap, live, failed, auth } = useStore();
  const [palette, setPalette] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [help, setHelp] = useState(false);
  // Every board counts as Home in the nav.
  const location = useLocation();
  const [overOpen, setOverOpen] = useState(false);
  // Any change of page (a link in it, Back) closes the More sheet and menu.
  useEffect(() => {
    setMoreOpen(false);
    setOverOpen(false);
  }, [location.pathname]);
  const navType = useNavigationType();
  // Back and Forward return to where you were. Pages load in pieces, so the
  // position is retried until the page is tall enough to hold it.
  useEffect(() => {
    // Patchboard restores positions itself; the browser's own restore runs
    // before a page has loaded and puts it back at the top.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    try {
      sessionStorage.removeItem('pb-scroll:default');
    } catch {
      /* nothing to clear */
    }
  }, []);
  useEffect(() => {
    const key = location.key;
    // Saved a moment after scrolling stops: when the next page renders
    // shorter, the browser clamps the scroll before this listener moves on,
    // and that clamp must not overwrite where you were.
    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(`pb-scroll:${key}`, String(Math.round(window.scrollY)));
        } catch {
          /* private mode: Back starts at the top */
        }
      }, 150);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', save);
    };
  }, [location.key]);
  const lastPath = useRef(location.pathname);
  const firstRender = useRef(true);
  useEffect(() => {
    // The page Patchboard opened on: the browser decides, as on any site.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const moved = lastPath.current !== location.pathname;
    lastPath.current = location.pathname;
    if (navType !== 'POP') {
      // A new page starts at its top; a sort or filter change stays put.
      if (moved && !location.hash) window.scrollTo(0, 0);
      // A screen reader hears the new page: focus its heading, once it has rendered,
      // unless something on the page already took focus.
      if (moved) {
        const t = setTimeout(() => {
          const at = document.activeElement;
          if (at && at !== document.body && !at.closest('.nav, .topbar, .more-sheet')) return;
          const h = document.querySelector<HTMLElement>('main h1');
          if (!h) return;
          if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
          h.focus({ preventScroll: true });
        }, 120);
        return () => clearTimeout(t);
      }
      return;
    }
    let y = 0;
    try {
      y = Number(sessionStorage.getItem(`pb-scroll:${location.key}`)) || 0;
    } catch {
      /* nothing saved */
    }
    if (!y) {
      window.scrollTo(0, 0);
      return;
    }
    let tries = 0;
    const t = setInterval(() => {
      if (document.documentElement.scrollHeight - window.innerHeight >= y - 2 || ++tries > 30) {
        window.scrollTo(0, y);
        clearInterval(t);
      }
    }, 50);
    return () => clearInterval(t);
  }, [location.key]);
  const onBoard = location.pathname.startsWith('/b/');
  const household = !!snap?.household;
  useFollowOpens();
  useNightDim();
  const householdRef = useRef(false);
  householdRef.current = household;
  // On a household device, links into the admin pages stay as text: styles
  // key off this attribute, and a click or Enter on one goes nowhere.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-household', household);
    if (!household) return;
    const stop = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && a.origin === window.location.origin && adminPage(a.pathname)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', stop, true);
    return () => document.removeEventListener('click', stop, true);
  }, [household]);
  const navigate = useNavigate();
  const gAt = useRef(0);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // The tab indicator, title count and installed app badge follow alerts.
  const serious = needsYou(snap?.alerts);
  const level = serious.some((a) => a.level === 'critical') ? 'critical' : serious.length ? 'warn' : null;
  useEffect(() => {
    if (snap) setStatus(level, serious.length);
  }, [snap, level, serious.length]);
  const worstAlert = useRef<{ href?: string } | undefined>(undefined);
  worstAlert.current = ['critical', 'warn', 'info'].map((l) => snap?.alerts.find((x) => x.level === l && x.href)).find(Boolean);
  const name = snap?.brand?.name || 'Patchboard';
  useEffect(() => setAppName(name), [name]);
  useEffect(() => setIconVersion(snap?.brand?.icon), [snap?.brand?.icon]);
  // Each page names itself in the tab, so history and tabs tell them apart.
  useEffect(() => {
    const p = location.pathname;
    // A container page uses its app's name, as its heading does.
    const ctr = p.startsWith('/c/') ? decodeURIComponent(p.slice(3)) : '';
    const page = p === '/' || p.startsWith('/b/') ? '' : ctr ? (serviceFor(snap, ctr)?.name ?? ctr) : p.startsWith('/logs') ? 'Logs' : ({ '/server': 'Server', '/stacks': 'Stacks', '/reading': 'Reading', '/upcoming': 'Upcoming', '/weather': 'Weather', '/apps': 'Apps', '/settings': 'Settings' } as Record<string, string>)[p];
    if (page !== undefined) setPageName(page);
  }, [location.pathname, !!snap]);

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
      if (!getAppearance().keys) return;
      if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') {
        setHelp((h) => !h);
      } else if (e.key === '.') {
        // The worst thing that needs you, straight to its fix.
        const worst = worstAlert.current;
        if (worst?.href) {
          if (/^https?:/.test(worst.href)) window.open(worst.href, '_blank', 'noopener');
          else navigate(worst.href);
        }
      } else if (e.key === 'g') {
        gAt.current = Date.now();
      } else if (Date.now() - gAt.current < 1200 && GO[e.key] && !(householdRef.current && adminPage(GO[e.key][0]))) {
        gAt.current = 0;
        setHelp(false);
        navigate(GO[e.key][0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A count from before Miniflux stopped answering is no count at all.
  const feeds = snap?.sources.miniflux;
  const unreadFeeds = feeds?.ok ? ((feeds.data as { unread: number } | null)?.unread ?? 0) : 0;
  const reading = !!snap?.sources.miniflux || !!snap?.demo;
  // Counts beside a page's name, as Reading shows unread: downloads not
  // finished yet, and requests waiting for you. A source that stopped
  // answering counts nothing.
  const liveData = <T,>(id: string) => (snap?.sources[id as 'qbit']?.ok ? (snap.sources[id as 'qbit']!.data as T | null) : null);
  const unfinished = ['qbit', 'transmission', 'deluge', 'sabnzbd', 'nzbget'].reduce((n, id) => {
    const d = liveData<{ downloading?: number; stalled?: number }>(id);
    return n + (d ? (d.downloading ?? 0) + (d.stalled ?? 0) : 0);
  }, 0);
  const badges: Record<string, number> = { '/reading': unreadFeeds, '/downloads': unfinished, '/requests': liveData<{ pending?: number }>('overseerr')?.pending ?? 0 };
  const badge = (to: string) => (badges[to] > 0 ? <span className="nav-badge">{count(badges[to])}</span> : null);
  const phoneTabs = household ? ['/', '/upcoming', reading ? '/reading' : '/weather'] : ['/', '/server', '/stacks', reading ? '/reading' : '/upcoming'];
  // Downloads, Library, Requests, Media and Ad blocking appear once something feeds them (shared/feeds.ts).
  const on = (id: string) => !!snap?.sources[id as keyof Snapshot['sources']];
  const nav = NAV.filter((n) => !(household && adminPage(n.to)) && (!PAGE_SOURCES[n.to] || anyOn(PAGE_SOURCES[n.to], on)));
  const more: { to: string; label: string }[] = [...nav.filter((n) => !phoneTabs.includes(n.to)), { to: '/weather', label: 'Weather' }, { to: '/settings', label: 'Settings' }].filter(
    (m) => !phoneTabs.includes(m.to) && !(household && adminPage(m.to)),
  );
  const inMore = more.some((m) => location.pathname === m.to || location.pathname.startsWith(`${m.to}/`));

  // A wide screen shows every page it has room for; the rest wrap out of
  // sight and go under More. Measured, so it holds for any set of pages,
  // any language and any name.
  const navRef = useRef<HTMLElement>(null);
  const [over, setOver] = useState<string[]>([]);
  // The empty end of the nav's first line, which More moves back over.
  const [slack, setSlack] = useState(0);
  const navWords = nav.map((n) => t(n.label)).join('|');
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const links = [...el.querySelectorAll<HTMLElement>('[data-nav]')].filter((l) => l.offsetParent);
      const top = links[0]?.offsetTop ?? 0;
      const shown = links.filter((l) => l.offsetTop <= top + 4);
      const out = links.filter((l) => l.offsetTop > top + 4).map((l) => l.dataset.nav!);
      setOver((was) => (was.join() === out.join() ? was : out));
      const last = shown.at(-1);
      setSlack(out.length && last ? Math.max(0, Math.round(el.getBoundingClientRect().right - last.getBoundingClientRect().right)) : 0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [navWords]);

  // The bar's tighter steps follow what it holds, not just the window's
  // width: enlarged text, a long name or a longer language step it down too.
  const barRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const wide = window.matchMedia('(min-width: 761px)');
    const fit = () => {
      delete bar.dataset.tight;
      if (wide.matches) for (const step of ['1', '2']) if (bar.scrollWidth > bar.clientWidth + 1) bar.dataset.tight = step;
    };
    const ro = new ResizeObserver(fit);
    for (const el of [bar, ...bar.children]) ro.observe(el);
    fit();
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [navWords]);
  const overItems = nav.filter((n) => over.includes(n.to));
  const inOver = overItems.some((m) => location.pathname === m.to || location.pathname.startsWith(`${m.to}/`));
  // More carries a dot when a page inside it has a count, so nothing waits unseen.
  const dot = (items: { to: string }[]) => (items.some((m) => badges[m.to] > 0) ? <span className="nav-dot" role="img" aria-label={t('something new inside')} /> : null);
  useEffect(() => {
    if (!overOpen) return;
    const away = (e: PointerEvent) => !(e.target as Element).closest?.('.nav-over') && setOverOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOverOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [overOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <PullRefresh />
      <WallPages />
      <header className="topbar" ref={barRef}>
        <NavLink to="/" className="wordmark" aria-label={`${name}, home`}>
          <span title={name}>{name}</span>
        </NavLink>
        <nav className="nav" aria-label="Views" ref={navRef}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-nav={n.to}
              className={({ isActive }) => `nav-link ${phoneTabs.includes(n.to) ? '' : 'nav-desktop'} ${over.includes(n.to) ? 'nav-wrapped' : ''} ${isActive || (n.to === '/' && onBoard) ? 'active' : ''}`}
            >
              {ICONS[n.to] && (
                <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[n.to]} />
                </svg>
              )}
              <span>{t(n.label)}</span>
              {badge(n.to)}
            </NavLink>
          ))}
          <button type="button" className={`nav-link nav-more ${inMore ? 'active' : ''}`} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
            <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d={ICONS.more} />
            </svg>
            <span>{t('More')}</span>
            {dot(more)}
          </button>
        </nav>
        {overItems.length > 0 && (
          <div className="nav-over" style={slack ? { transform: `translateX(-${slack}px)` } : undefined}>
            <button type="button" className={`nav-link ${inOver ? 'active' : ''}`} aria-expanded={overOpen} aria-controls="nav-over-list" onClick={() => setOverOpen((o) => !o)}>
              {t('More')}
              {dot(overItems)}
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {overOpen && (
              <div className="nav-over-list" id="nav-over-list">
                {overItems.map((m) => (
                  <NavLink key={m.to} to={m.to} className="nav-over-link">
                    {t(m.label)}
                    {badge(m.to)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="topbar-end">
          {snap?.demo && <span className="pill demo-pill">{t('Demo data')}</span>}
          {household ? (
            <span className="pill" title={`${snap?.household?.name}: this device can look, and switch lights and scenes, but not change the server`}>
              Household
            </span>
          ) : (
            snap?.readOnly && (
              <span className="pill" title="READ_ONLY=1: you can't change anything on this server from here">
                Read-only
              </span>
            )
          )}
          <span className={`live ${live ? 'live-on' : ''}`} title={live ? 'Receiving live updates' : 'Reconnecting'}>
            {live ? t('Live') : failed ? t('Offline') : t('Connecting')}
          </span>
          <button type="button" className="topbar-icon topbar-search" aria-label="Jump to" onClick={() => setPalette(true)}>
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          </button>
          {!household && (
          <NavLink to="/settings" className="topbar-icon topbar-settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            <span className="topbar-label" aria-hidden>{t('Settings')}</span>
          </NavLink>
          )}
          <button type="button" className="topbar-icon topbar-help" aria-label="Help and keyboard shortcuts" onClick={() => setHelp(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 16.8h.01" />
            </svg>
          </button>
          <button type="button" className="jump" onClick={() => setPalette(true)}>
            <span>{t('Jump to')}</span>
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
        ) : household && adminPage(location.pathname) ? (
          <Navigate to="/" replace />
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
      {moreOpen && <MoreSheet items={more} badges={badges} feedback={household ? undefined : { version: snap?.self?.version, path: location.pathname }} onJump={() => (setMoreOpen(false), setPalette(true))} onClose={() => setMoreOpen(false)} />}
      {help && <KeyboardHelp mac={mac} household={household} version={snap?.self?.version} path={location.pathname} onClose={() => setHelp(false)} />}
    </div>
  );
}

/** The phone's More tab: every page the tab bar has no room for, and Settings. */
function MoreSheet({ items, badges, feedback, onJump, onClose }: { items: { to: string; label: string }[]; badges: Record<string, number>; feedback?: { version?: string; path: string }; onJump: () => void; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="palette-backdrop more-backdrop" onClick={onClose}>
      <div className="more-sheet" ref={modal} role="dialog" aria-label="More pages" onClick={(e) => e.stopPropagation()}>
        <nav aria-label="More pages">
          {items.map((m) => (
            <NavLink key={m.to} to={m.to} className="more-link" onClick={onClose}>
              <span>{t(m.label)}</span>
              {badges[m.to] > 0 && <span className="nav-badge">{count(badges[m.to])}</span>}
            </NavLink>
          ))}
          <button type="button" className="more-link" onClick={onJump}>
            <span>Jump to anything</span>
          </button>
          <a className="more-link" href={HELP.tour} target="_blank" rel="noreferrer" onClick={onClose}>
            <span>Help</span>
          </a>
          {feedback && (
            <>
              <a className="more-link" href={ideaUrl(feedback.version, feedback.path)} target="_blank" rel="noreferrer" onClick={onClose}>
                <span>Suggest an idea</span>
              </a>
              <a className="more-link" href={problemUrl(feedback.version)} target="_blank" rel="noreferrer" onClick={onClose}>
                <span>Report a problem</span>
              </a>
            </>
          )}
        </nav>
        <button type="button" className="button more-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function KeyboardHelp({ mac, household, version, path, onClose }: { mac: boolean; household: boolean; version?: string; path: string; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette shortcuts" ref={modal} onKeyDown={(e) => { if (e.key === '?') { e.preventDefault(); e.stopPropagation(); onClose(); } }} role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head"><h2>Help</h2><button type="button" className="text-button" onClick={onClose}>Close</button></header>
        <p className="help-links">
          <a href={HELP.tour} target="_blank" rel="noreferrer">A tour of every page</a>
          <a href={HELP.integrations} target="_blank" rel="noreferrer">Connecting your apps</a>
          <a href={HELP.configuration} target="_blank" rel="noreferrer">Configuration</a>
        </p>
        {!household && (
          <>
            <h3 className="jw-sub">Ideas and problems</h3>
            <p className="help-links">
              <a href={ideaUrl(version, path)} target="_blank" rel="noreferrer">Suggest an idea</a>
              <a href={appUrl()} target="_blank" rel="noreferrer">Ask for an app</a>
              <a href={problemUrl(version)} target="_blank" rel="noreferrer">Report a problem</a>
            </p>
            <p className="help-note">Each opens on GitHub with your version filled in and nothing private. You send it from your own GitHub account.</p>
          </>
        )}
        <h3 className="jw-sub">Keyboard</h3>
        <dl>
          <div><dt><kbd>{mac ? '⌘' : 'Ctrl'} K</kbd> <kbd>/</kbd></dt><dd>Jump to anything</dd></div>
          {Object.entries(GO).filter(([, [to]]) => !(household && adminPage(to))).map(([k, [, label]]) => (
            <div key={k}><dt><kbd>g</kbd> <kbd>{k}</kbd></dt><dd>{label}</dd></div>
          ))}
          <div><dt><kbd>j</kbd> <kbd>k</kbd> <kbd>o</kbd> <kbd>u</kbd></dt><dd>Reading: next, previous, open, back to the list</dd></div>
          <div><dt><kbd>.</kbd></dt><dd>The worst thing that needs you</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>This help</dd></div>
        </dl>
      </div>
    </div>
  );
}
