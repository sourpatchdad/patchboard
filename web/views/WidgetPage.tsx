// One widget filling the screen, with nothing around it: for a Pi with a
// small display, a corner tablet, or a page among a wall tablet's others.
// Picked in Settings, Devices, from every widget on every board; it follows
// the widget's own settings, so One number shows one number, large.

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { WidgetAlone } from '../board/Board.tsx';
import { WallPages } from '../components/WallPages.tsx';
import { setPageName } from '../lib/appearance.ts';
import { useFollowOpens, useNightDim } from '../lib/household.ts';

/**
 * This page as an app of its own: Add to Home Screen installs the widget,
 * named after it and opening straight to it. The manifest comes from the
 * API with credentials, so sign-in still guards it; leaving puts Patchboard's
 * own manifest back.
 */
function useWidgetManifest(board: string, widget: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.getAttribute('href') ?? '/manifest.webmanifest';
    const base = /\/(manifest[\w-]*)\.webmanifest$/.exec(before)?.[1] ?? 'manifest';
    link.crossOrigin = 'use-credentials';
    link.href = `/api/manifest/w/${encodeURIComponent(board)}/${encodeURIComponent(widget)}?base=${base}`;
    return () => {
      link.href = before;
      link.removeAttribute('crossorigin');
    };
  }, [board, widget]);
}

export function WidgetPage() {
  const { board = '', widget = '' } = useParams();
  useEffect(() => setPageName(''), []);
  useWidgetManifest(board, widget);
  useFollowOpens();
  useNightDim();
  return (
    <main className="widget-page">
      <WallPages />
      <WidgetAlone boardId={board} widgetId={widget} />
    </main>
  );
}
