// Hairline charts. One stroke in ink, no fill, no axes: a sparkline answers
// "is this climbing?" and nothing more. Exact values live in the text beside it.

import type { Series } from '../../shared/types.ts';

export function Spark({
  data,
  height = 32,
  min = 0,
  max,
  label,
}: {
  data: Series | undefined;
  height?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  if (!data || data.length < 2) {
    return <div className="spark spark-empty" style={{ height }} aria-label={`${label}: not enough history yet`} />;
  }
  const t0 = data[0][0];
  const t1 = data[data.length - 1][0];
  const top = max ?? Math.max(...data.map((d) => d[1])) * 1.15;
  const span = top - min || 1;
  const yOf = (v: number) => height - 1 - ((Math.min(top, Math.max(min, v)) - min) / span) * (height - 2);
  const pts = data
    .map(([t, v]) => {
      const x = ((t - t0) / (t1 - t0 || 1)) * 100;
      return `${x.toFixed(2)},${yOf(v).toFixed(2)}`;
    })
    .join(' ');
  return (
    <span className="spark-wrap" style={{ height }}>
      <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={label}>
        <line className="spark-base" x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} vectorEffect="non-scaling-stroke" />
        <polyline points={pts} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The latest reading: where the line is now. */}
      <i className="spark-now" style={{ top: `${(yOf(data[data.length - 1][1]) / height) * 100}%` }} aria-hidden />
    </span>
  );
}

/** A hairline bar split into parts, e.g. memory: services, cache, free. */
export function Split({ parts, label }: { parts: { value: number; tone: 'ink' | 'mid' | 'faint' | 'warn' | 'crit'; title: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="split" role="img" aria-label={label}>
      {parts.map((p) => (
        <span key={p.title} className={`split-${p.tone}`} style={{ width: `${(p.value / total) * 100}%` }} title={p.title} />
      ))}
    </div>
  );
}
