import { type ComponentType, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, redirect, RouterProvider } from 'react-router-dom';
import { Shell } from './components/Shell.tsx';
import { SnapshotProvider } from './lib/store.tsx';
import { Home } from './views/Home.tsx';
import { initAppearance } from './lib/appearance.ts';
import { NotFound } from './views/NotFound.tsx';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/dm-sans';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/dm-serif-display/400.css';
import './styles.css';

// Home loads with the app; every other page loads the first time it opens,
// so a phone opening Home doesn't download Settings and the editors.
const page = <M extends Record<string, any>>(load: () => Promise<M>, name: keyof M) => async () => ({ Component: (await load())[name] as ComponentType });

const router = createBrowserRouter([
  {
    element: <Shell />,
    // Pages load lazily; nothing to show for the instant before the first one does.
    HydrateFallback: () => null,
    children: [
      { path: '/', element: <Home /> },
      { path: '/b/:board', element: <Home /> },
      { path: '/server', lazy: page(() => import('./views/Server.tsx'), 'Server') },
      { path: '/stacks', lazy: page(() => import('./views/Stacks.tsx'), 'Stacks') },
      { path: '/c/:name', lazy: page(() => import('./views/Container.tsx'), 'ContainerPage') },
      { path: '/reading', lazy: page(() => import('./views/Feeds.tsx'), 'Feeds') },
      // The page was /feeds before it was Reading; old bookmarks still land.
      { path: '/feeds', loader: ({ request }) => redirect(`/reading${new URL(request.url).search}`) },
      { path: '/upcoming', lazy: page(() => import('./views/Upcoming.tsx'), 'Upcoming') },
      { path: '/weather', lazy: page(() => import('./views/Weather.tsx'), 'Weather') },
      { path: '/logs', lazy: page(() => import('./views/Logs.tsx'), 'Logs') },
      { path: '/logs/:name', lazy: page(() => import('./views/Logs.tsx'), 'Logs') },
      { path: '/apps', lazy: page(() => import('./views/Apps.tsx'), 'Apps') },
      { path: '/settings', lazy: page(() => import('./views/Settings.tsx'), 'Settings') },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnapshotProvider>
      <RouterProvider router={router} />
    </SnapshotProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js');
}
