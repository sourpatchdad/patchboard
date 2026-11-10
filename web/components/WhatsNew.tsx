// Patchboard's version at the foot of Home. Quiet when current; "Update to
// v1.2.0" when a newer release is out; "What's new in v1.2.0" once after an
// update. Either opens a sheet with what each release changed and, where
// Patchboard can update itself, the button that does it.

import { lazy, Suspense, useEffect, useState } from 'react';
import type { SelfRelease } from '../../shared/types.ts';
import { compareVersions } from '../../shared/version.ts';
import { useJson } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

const SEEN = 'pb-seen-version';
const WhatsNew = lazy(() => import('./WhatsNewSheet.tsx'));

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    return null;
  }
}

function markSeen(version: string): void {
  try {
    localStorage.setItem(SEEN, version);
  } catch {
    // Private mode: the "what's new" note just shows again next time.
  }
}

export function VersionLine() {
  const { snap } = useStore();
  const { data } = useJson<{ version: string; releases: SelfRelease[] }>('/api/self/releases');
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const me = snap?.self;
  const version = me?.version ?? '';

  // A first visit has nothing new to announce: remember this version quietly.
  useEffect(() => {
    if (version && seen === null) {
      markSeen(version);
      setSeen(version);
    }
  }, [version, seen]);

  if (!me) return null;
  const releases = data?.releases ?? [];
  const newer = releases.filter((r) => compareVersions(r.version, version) > 0);
  const newImage = !!(me.container && snap.updates[me.container]);
  const fresh = !!seen && compareVersions(version, seen) > 0;
  const label = newer.length ? `Update to v${newer[0].version}` : newImage ? 'A newer image is out' : fresh ? `What's new in v${version}` : `v${version}`;

  return (
    <>
      <button type="button" className={`text-button version-line ${newer.length || newImage || fresh ? 'is-news' : ''}`} aria-haspopup="dialog" aria-label={newer.length || newImage ? `${label}: what's new` : `Patchboard v${version}: what's new`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Suspense fallback={null}>
          <WhatsNew
            version={version}
            releases={releases}
            newer={newer}
            newImage={newImage}
            onClose={() => {
              setOpen(false);
              markSeen(version);
              setSeen(version);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
