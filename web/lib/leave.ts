// Unsaved work asks before it's thrown away: leaving the page inside the app
// (a nav link, Back) or closing the tab. Arrange board and Edit apps use it.

import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useLeaveGuard(dirty: boolean, question: string): void {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(question)) blocker.proceed();
    else blocker.reset();
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
