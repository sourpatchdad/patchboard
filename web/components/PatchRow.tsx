// The patch row: every service as a jack on a patch bay, grouped into bays
// with a scribble-strip label under each jack. The LED shows container state;
// clicking a jack opens the service. One glance answers "is everything up?"

import { Link } from 'react-router-dom';
import { numberText, useAppNumbers } from '../lib/appstats.ts';
import { useStore } from '../lib/store.tsx';
import { checkFor, checkText, containerMap, isExternal, jackState, isParked, jackStateText, tapeLabel } from '../lib/services.ts';
import { Roving } from './Roving.tsx';
import { Icon } from './ui.tsx';
import { alertLevelFor } from '../lib/attention.ts';

export function PatchRow({ names = false }: { names?: boolean }) {
  const { snap } = useStore();
  const nums = useAppNumbers();
  if (!snap) return <div className="patchrow patchrow-loading" aria-hidden />;
  const containers = containerMap(snap);

  return (
    <nav className={`patchrow ${names ? '' : 'icons-only'}`} aria-label="Services">
      {snap.catalog.groups.map((g) => (
        <div className="bay" key={g.name}>
          <span className="bay-name">{g.name}</span>
          <Roving className="bay-jacks">
            {g.services.map((s) => {
              const ck = checkFor(snap, s.name);
              // A running app with a problem named on it reads amber or red, as Needs attention has it.
              const raised = alertLevelFor(snap.alerts, s);
              const base = jackState(s, containers, ck);
              const state = base === 'up' && raised ? (raised === 'crit' ? 'down' : 'warn') : base;
              const words = state === 'idle' && isParked(s.container) ? 'stopped from Patchboard' : jackStateText[state];
              const live = numberText(nums[s.name])?.text;
              const label = `${s.name}${live ? `: ${live}` : ''}, ${ck && !ck.ok ? checkText(ck) : words}${ck?.ok ? `, ${checkText(ck)}` : ''}`;
              const inner = (
                <>
                  <span className="jack-socket">
                    <Icon name={s.name} icon={s.icon} size={22} />
                    <span className="jack-led" />
                  </span>
                  <span className="jack-label">{tapeLabel(s)}</span>
                </>
              );
              if (s.href && isExternal(s.href)) {
                return (
                  <a key={s.name} className="jack" data-state={state} data-name={numberText(nums[s.name]) ? `${s.name}: ${numberText(nums[s.name])!.text}` : s.name} href={s.href} target="_blank" rel="noreferrer" title={label} aria-label={label}>
                    {inner}
                  </a>
                );
              }
              if (s.container) {
                return (
                  <Link key={s.name} className="jack" data-state={state} data-name={numberText(nums[s.name]) ? `${s.name}: ${numberText(nums[s.name])!.text}` : s.name} to={`/c/${s.container}`} title={`${label}. Open details`} aria-label={`${label}. Open details`}>
                    {inner}
                  </Link>
                );
              }
              return (
                <span key={s.name} className="jack" data-state={state} data-name={numberText(nums[s.name]) ? `${s.name}: ${numberText(nums[s.name])!.text}` : s.name} title={label}>
                  {inner}
                </span>
              );
            })}
          </Roving>
        </div>
      ))}
    </nav>
  );
}
