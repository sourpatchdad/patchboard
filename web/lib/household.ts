// A household device follows the page set for it in Settings: once when the
// app starts, and again whenever someone changes it, with nobody touching
// the device. It takes the look set for it, loads the new version after an
// update, and dims through the night hours set for it. Mounted in the page
// frame and in the Monitor, which sits outside it.

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNight } from '../../shared/wall.ts';
import type { DeviceLook } from '../../shared/types.ts';
import { getAppearance, setAppearance } from './appearance.ts';
import { useStore } from './store.tsx';

// Shared across both mounts, so a page change isn't applied twice.
let followed: number | null | undefined;
// The Patchboard version this page loaded with.
let loadedWith: string | undefined;

export function useFollowOpens(): void {
  const { snap } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const opens = snap?.household?.opens;
  const rev = snap?.household?.rev ?? null;
  // After an update the device reconnects on its own but would keep running
  // the old page, so it loads the new one. Nothing is lost: it can't edit.
  const version = snap?.self?.version;
  useEffect(() => {
    if (!snap?.household || !version) return;
    loadedWith ??= version;
    if (version !== loadedWith) location.reload();
  }, [snap?.household, version]);
  // The look set for it in Settings, Devices, kept as its own so the next
  // load paints with it at once. It can't open Settings, so nothing here is
  // lost. A new language redraws every word: load the page again.
  const look = snap?.household?.look;
  const lookKey = JSON.stringify(look ?? {});
  useEffect(() => {
    if (!look) return;
    const a = getAppearance();
    const patch = Object.fromEntries(Object.entries(look).filter(([k, v]) => a[k as keyof DeviceLook] !== v));
    if (!Object.keys(patch).length) return;
    setAppearance(patch, { push: false });
    if ('lang' in patch) location.reload();
  }, [lookKey]);
  useEffect(() => {
    if (!snap?.household) return;
    if (followed === rev) return;
    followed = rev;
    if (opens && pathname !== opens) navigate(opens, { replace: true });
  }, [snap?.household, opens, rev, pathname, navigate]);
}

// A tap brightens a dimmed screen for this long, and is used up doing it.
const WAKE_MS = 2 * 60_000;
let veil: HTMLDivElement | null = null;
let wokeAt = 0;
let mounts = 0;

/** Dim the screen through the device's night hours. */
export function useNightDim(): void {
  const { snap } = useStore();
  const dim = snap?.household?.dim;
  useEffect(() => {
    if (!dim) return;
    mounts += 1;
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'night-veil';
      veil.setAttribute('aria-hidden', 'true');
      veil.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        wokeAt = Date.now();
        check();
      });
      document.body.append(veil);
    }
    const check = () => veil?.classList.toggle('is-on', isNight(dim, new Date()) && Date.now() - wokeAt > WAKE_MS);
    check();
    const timer = setInterval(check, 20_000);
    return () => {
      clearInterval(timer);
      mounts -= 1;
      if (!mounts) {
        veil?.remove();
        veil = null;
      }
    };
  }, [dim]);
}
