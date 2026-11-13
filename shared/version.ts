/** The release a version belongs to: 1.13.0 from 1.13.0+edge.4f2c1a9. */
export const baseVersion = (v: string): string => v.replace(/^v/, '').split('+')[0];

/** A version as people read it: 1.13.0, or 1.13.0, edge 4f2c1a9 for a build between releases. */
export function showVersion(v: string): string {
  const [base, build] = v.replace(/^v/, '').split('+');
  return build ? `${base}, ${build.replace('.', ' ')}` : base;
}

/** -1, 0 or 1 for two x.y.z versions (a leading v is fine). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
}
