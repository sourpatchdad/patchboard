// A household device's pages, all kept alive. Each page draws once, in the
// background while another shows; a swipe then shows one and hides the
// other instead of tearing a page down and building the next, which takes
// a slow tablet seconds. A hidden page keeps its picture and state, stops
// its timers and listeners, and catches up on new data when it shows.

import { Activity, lazy, Suspense } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store.tsx';
import { Shell } from './Shell.tsx';
import { Home } from '../views/Home.tsx';

const Monitor = lazy(async () => ({ default: (await import('../views/Monitor.tsx')).Monitor }));
const Server = lazy(async () => ({ default: (await import('../views/Server.tsx')).Server }));
const Weather = lazy(async () => ({ default: (await import('../views/Weather.tsx')).Weather }));
const Upcoming = lazy(async () => ({ default: (await import('../views/Upcoming.tsx')).Upcoming }));
const Feeds = lazy(async () => ({ default: (await import('../views/Feeds.tsx')).Feeds }));

/** The pages this device swipes between, when there's more than one. */
export function useDeck(): string[] {
  const { snap } = useStore();
  const h = snap?.household;
  const list = h?.opens ? [h.opens, ...(h.pages ?? [])] : [];
  return list.length > 1 ? [...new Set(list)] : [];
}

function Page({ path }: { path: string }) {
  return (
    <Suspense fallback={null}>
      <Routes location={path}>
        <Route path="/monitor" element={<Monitor />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/b/:board" element={<Home />} />
          <Route path="/server" element={<Server />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/upcoming" element={<Upcoming />} />
          <Route path="/reading" element={<Feeds />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

/** The app's outermost frame: the deck on a page this device swipes through, the usual page anywhere else. */
export function Root() {
  const deck = useDeck();
  const { pathname } = useLocation();
  if (!deck.includes(pathname)) return <Outlet />;
  return (
    <>
      {deck.map((p) => (
        <Activity key={p} mode={p === pathname ? 'visible' : 'hidden'}>
          <Page path={p} />
        </Activity>
      ))}
    </>
  );
}
