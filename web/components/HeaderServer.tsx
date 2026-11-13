import { Link } from 'react-router-dom';
import type { NutData, SystemData, TruenasData } from '../../shared/types.ts';
import { headlineUps, upsLabel, upsLevel } from '../../shared/ups.ts';
import { pct, size } from '../lib/format.ts';
import { useSource } from '../lib/store.tsx';

/** A live summary from the existing SSE snapshot, without history requests. */
export function HeaderServer({ storage }: { storage: boolean }) {
  const system = useSource<SystemData>('system');
  const truenas = useSource<TruenasData>('truenas');
  const ups = headlineUps(useSource<NutData>('nut').data?.ups);
  const sys = system.state?.ok ? system.data : null;
  const nas = truenas.state?.ok ? truenas.data : null;
  const pool = nas?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
  const storagePct = pool?.usedPct ?? sys?.pool?.usedPct;
  const mem = sys?.mem;
  const used = mem && [mem.total, mem.available, mem.arc].every(Number.isFinite) && mem.total > 0 && mem.available >= 0 && mem.arc >= 0
    ? Math.max(0, mem.total - mem.available - mem.arc) : null;
  const cpu = sys && Number.isFinite(sys.cpuPct) && sys.cpuPct >= 0 ? sys.cpuPct : null;
  const space = storage && storagePct != null && Number.isFinite(storagePct) && storagePct >= 0 ? storagePct : null;
  if (cpu == null && used == null && space == null) return null;
  return (
    <nav className="header-server" aria-label="Server resources">
      {cpu != null && (
        <Link className="header-server-metric" to="/server#cpu" title="CPU by hour">
          <span className="header-server-value">{pct(cpu)}</span>
          <span className="header-server-label">CPU</span>
        </Link>
      )}
      {used != null && (
        <Link className="header-server-metric" to="/server#resources" title="Memory in use, excluding ZFS cache">
          <span className="header-server-value">{size(used)}</span>
          <span className="header-server-label">Memory in use</span>
        </Link>
      )}
      {space != null && (
        <Link className="header-server-metric" to={pool ? `/server#storage-${encodeURIComponent(pool.name)}` : '/server#storage'} title={pool ? `Storage on ${pool.name}` : 'Storage use'}>
          <span className="header-server-value">{pct(space)}</span>
          <span className="header-server-label">Storage</span>
        </Link>
      )}
      {ups && (
        <span className="header-server-metric" title={[ups.name, ups.model].filter(Boolean).join(', ')}>
          <span className={`header-server-value ${upsLevel(ups) === 'crit' ? 'crit-text' : upsLevel(ups) === 'warn' ? 'warn-text' : ''}`}>
            {ups.charge != null ? pct(ups.charge) : ups.onBattery ? 'On battery' : 'On mains'}
          </span>
          <span className="header-server-label">{upsLabel(ups)}</span>
        </span>
      )}
    </nav>
  );
}
