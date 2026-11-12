// A QR code for a link, so a tablet or phone can open it with its camera
// instead of someone typing it. Drawn as SVG squares, dark on white with the
// four-square quiet border scanners expect, whatever the theme.

import qrcode from 'qrcode-generator';

export function Qr({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const full = n + quiet * 2;
  return (
    <svg className="qr" viewBox={`0 0 ${full} ${full}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={full} height={full} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
