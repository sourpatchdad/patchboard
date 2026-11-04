import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Shell } from './components/Shell.tsx';
import { SnapshotProvider } from './lib/store.tsx';
import { Apps } from './views/Apps.tsx';
import { ContainerPage } from './views/Container.tsx';
import { Feeds } from './views/Feeds.tsx';
import { Home } from './views/Home.tsx';
import { Logs } from './views/Logs.tsx';
import { Server } from './views/Server.tsx';
import { Settings } from './views/Settings.tsx';
import { initAppearance } from './lib/appearance.ts';
import { Stacks } from './views/Stacks.tsx';
import { Upcoming } from './views/Upcoming.tsx';
import { Weather } from './views/Weather.tsx';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/dm-sans';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/dm-serif-display/400.css';
import './styles.css';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/server', element: <Server /> },
      { path: '/stacks', element: <Stacks /> },
      { path: '/c/:name', element: <ContainerPage /> },
      { path: '/feeds', element: <Feeds /> },
      { path: '/upcoming', element: <Upcoming /> },
      { path: '/weather', element: <Weather /> },
      { path: '/logs', element: <Logs /> },
      { path: '/logs/:name', element: <Logs /> },
      { path: '/apps', element: <Apps /> },
      { path: '/settings', element: <Settings /> },
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
