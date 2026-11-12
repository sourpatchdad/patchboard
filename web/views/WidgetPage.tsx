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

export function WidgetPage() {
  const { board = '', widget = '' } = useParams();
  useEffect(() => setPageName(''), []);
  useFollowOpens();
  useNightDim();
  return (
    <main className="widget-page">
      <WallPages />
      <WidgetAlone boardId={board} widgetId={widget} />
    </main>
  );
}
