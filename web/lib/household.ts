// A household device follows the page set for it in Settings: once when the
// app starts, and again whenever someone changes it, with nobody touching
// the device. Mounted in the page frame and in the Monitor, which sits
// outside it.

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store.tsx';

// Shared across both mounts, so a page change isn't applied twice.
let followed: number | null | undefined;

export function useFollowOpens(): void {
  const { snap } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const opens = snap?.household?.opens;
  const rev = snap?.household?.rev ?? null;
  useEffect(() => {
    if (!snap?.household) return;
    if (followed === rev) return;
    followed = rev;
    if (opens && pathname !== opens) navigate(opens, { replace: true });
  }, [snap?.household, opens, rev, pathname, navigate]);
}
