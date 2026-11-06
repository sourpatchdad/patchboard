import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fromNetdata, fromPrometheus } from '../adapters/monitoring.ts';

test('Netdata: raised alarms only, CRITICAL as critical, with the value and chart', () => {
  const a = fromNetdata({
    hostname: 'nas',
    alarms: {
      'disk_space._': { name: 'disk_space_usage', chart: 'disk_space._', status: 'CRITICAL', value_string: '96%', last_status_change: 1_800_000_000 },
      'ram.used': { name: 'ram_in_use', status: 'WARNING', summary: 'System RAM usage' },
      'cpu.cpu': { name: 'cpu', status: 'CLEAR' },
    },
  });
  assert.deepEqual(a.map((x) => [x.name, x.severity]), [['disk space usage', 'critical'], ['System RAM usage', 'warn']]);
  assert.equal(a[0].detail, '96% on disk_space._');
  assert.equal(a[0].since, 1_800_000_000_000);
});

test('Prometheus and Alertmanager: firing or active only; severity critical, page or error is critical', () => {
  const a = fromPrometheus([
    { labels: { alertname: 'HostDown', instance: 'pi:9100', severity: 'critical' }, annotations: { summary: 'Host down' }, state: 'firing', activeAt: '2026-11-06T01:00:00Z' },
    { labels: { alertname: 'DiskFilling', severity: 'warning' }, state: 'pending' },
    { labels: { alertname: 'CertExpiring', severity: 'info' }, status: { state: 'active' }, startsAt: '2026-11-06T01:00:00Z' },
    { labels: { alertname: 'Silenced' }, status: { state: 'suppressed' } },
  ]);
  assert.deepEqual(a.map((x) => [x.name, x.severity, x.instance]), [['Host down', 'critical', 'pi:9100'], ['CertExpiring', 'warn', undefined]]);
});
