// The four tire pressures on a drawing of the car. With a built-in drawing of
// your car (shared/car-art.ts, picked on the Tessie connection) each pressure
// sits on a leader to its tire, and you swipe between the views to turn the
// car. Without, the car is drawn like a blueprint: from the side, the far
// tires in dashed hidden lines, or from above. A low tire is the only thing
// in color. Each device remembers which view it last showed.

import { type PointerEvent, useRef, useState } from 'react';
import { artViews } from '../../shared/car-art.ts';
import { type CarPicture, labelSpots } from '../../shared/car-pictures.ts';
import { TIRES, type TirePos } from '../../shared/types.ts';
import { msg, t as tr } from '../lib/i18n.ts';

export interface TireReading {
  pos: TirePos;
  value: string;
  name: string;
  soft: boolean;
}

type View = { kind: 'side' } | { kind: 'above' } | { kind: 'picture'; pic: CarPicture };

const viewKey = (vin: string) => `pb-car-view:${vin}`;
function savedIndex(vin: string): number {
  try {
    return Number(localStorage.getItem(viewKey(vin))) || 0;
  } catch {
    return 0;
  }
}

/** The pressures on the car: swipe to turn it, or tap a dot for a view. */
export function CarTires({ vin, art, tires, unit }: { vin: string; art?: string; tires: TireReading[]; unit: string }) {
  const pics = artViews(art);
  const views: View[] = pics.length ? pics.map((pic) => ({ kind: 'picture', pic })) : [{ kind: 'side' }, { kind: 'above' }];
  const [index, setIndex] = useState(() => savedIndex(vin));
  const at = ((index % views.length) + views.length) % views.length;
  const view = views[at];
  const start = useRef<number | null>(null);
  const show = (next: number) => {
    setIndex(next);
    try {
      localStorage.setItem(viewKey(vin), String(next));
    } catch {
      // Private mode: it turns for this visit only.
    }
  };
  const turn = (by: number) => show((((at + by) % views.length) + views.length) % views.length);
  const down = (e: PointerEvent) => {
    start.current = e.clientX;
  };
  const up = (e: PointerEvent) => {
    if (start.current !== null && Math.abs(e.clientX - start.current) > 40) turn(e.clientX < start.current ? 1 : -1);
    start.current = null;
  };
  const label = `${tr('Tires')}, ${unit}: ${tires.map((t) => `${t.name} ${t.value}${t.soft ? `, ${tr('low')}` : ''}`).join(', ')}`;
  return (
    <div className="car-tires-wrap">
      <div className="car-tires-figure" role="img" aria-label={label} onPointerDown={down} onPointerUp={up} onPointerCancel={() => (start.current = null)}>
        {view.kind === 'side' ? <CarSide tires={tires} unit={unit} /> : view.kind === 'above' ? <CarAbove tires={tires} unit={unit} /> : <PictureView pic={view.pic} tires={tires} unit={unit} />}
      </div>
      <div className="car-views">
        {views.length > 1 && (
          <span className="car-dots">
            {views.map((v, i) => (
              <button key={i} type="button" className={`car-dot-btn ${i === at ? 'is-on' : ''}`} aria-label={tr(viewName(v))} aria-current={i === at || undefined} onClick={() => show(i)}>
                <i />
              </button>
            ))}
          </span>
        )}
        <span className="car-views-unit">{unit}</span>
      </div>
    </div>
  );
}

/** One view of the drawing, each pressure beside its tire on a short leader. */
function PictureView({ pic, tires, unit }: { pic: CarPicture; tires: TireReading[]; unit: string }) {
  const h = 100 / (pic.aspect ?? 2);
  const spots = labelSpots(pic.at, h);
  // The picture is 100 wide, with a gutter each side for the figures and a
  // strip under it for the unit, so no figure ever sits on the car.
  const outW = 100 + 2 * GUTTER;
  const outH = h + FOOT;
  return (
    <div className="car-photo is-drawing" style={{ aspectRatio: `${outW} / ${outH}` }}>
      <div className="car-photo-frame" style={{ left: `${(GUTTER / outW) * 100}%`, width: `${(100 / outW) * 100}%`, height: `${(h / outH) * 100}%` }}>
        <img src={pic.src} alt="" draggable={false} className="car-photo-img" />
      </div>
      <svg className="car-photo-marks" viewBox={`${-GUTTER} 0 ${outW} ${outH}`}>
        {tires.map((t) => {
          const { left, y } = spots[t.pos];
          const tx = left ? 1 - GUTTER : 99 + GUTTER;
          // The position sits under the figure; the leader runs under both to the picture's edge, then bends once to the tire.
          const ly = y + 4.6;
          const reach = left ? 0 : 100;
          const spot = pic.at[t.pos];
          return (
            <g key={t.pos} className={`car-callout ${t.soft ? 'is-soft' : ''}`}>
              {spot && (
                <>
                  <path className="car-lead" d={`M${tx} ${ly} L${reach} ${ly} L${spot[0]} ${(spot[1] * h) / 100}`} />
                  <circle className="car-dot" cx={spot[0]} cy={(spot[1] * h) / 100} r="0.6" />
                </>
              )}
              <text className="car-num" x={tx} y={y} textAnchor={left ? 'start' : 'end'}>
                {t.value}
              </text>
              <text className="car-pos" x={tx} y={y + 3.5} textAnchor={left ? 'start' : 'end'}>
                {t.pos.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Room beside a picture for the figures, and under it for the lowest one's leader, in the picture's own units (it is 100 wide). */
const GUTTER = 9;
const FOOT = 2;

/** A view's name, for its dot. */
function viewName(v: View): string {
  if (v.kind === 'side') return VIEW_NAMES.side;
  if (v.kind === 'above') return VIEW_NAMES.top;
  return VIEW_NAMES[v.pic.view ?? 'side'];
}
const VIEW_NAMES: Record<NonNullable<CarPicture['view']>, string> = {
  side: msg('Side view'),
  front: msg('Front view'),
  rear: msg('Rear view'),
  top: msg('Top view'),
  front34: msg('Front three-quarter'),
  rear34: msg('Rear three-quarter'),
};


const by = (tires: TireReading[]) => Object.fromEntries(tires.map((t) => [t.pos, t])) as Record<TirePos, TireReading>;

/** A pressure and its tire's short name, at one end of a leader. */
function Callout({ t, x, y, end, line, dot }: { t: TireReading; x: number; y: number; end?: boolean; line: string; dot: [number, number] }) {
  return (
    <g className={`car-callout ${t.soft ? 'is-soft' : ''}`}>
      <path className="car-lead" d={line} />
      <circle className="car-dot" cx={dot[0]} cy={dot[1]} r="1.8" />
      <text className="car-num" x={x} y={y} textAnchor={end ? 'end' : 'start'}>
        {t.value}
        <tspan className="car-pos" dx="6">
          {t.pos.toUpperCase()}
        </tspan>
      </text>
    </g>
  );
}

/** A five-spoke wheel at a tire's center. */
const Wheel = ({ cx, cy, soft }: { cx: number; cy: number; soft: boolean }) => (
  <g className={`car-wheel ${soft ? 'is-soft' : ''}`}>
    <circle className="car-tire" cx={cx} cy={cy} r="24" />
    <circle className="car-rim" cx={cx} cy={cy} r="15" />
    <circle className="car-rim" cx={cx} cy={cy} r="3" />
    {[0, 72, 144, 216, 288].map((a) => {
      const r = (a * Math.PI) / 180;
      return <line key={a} className="car-rim" x1={cx + 4 * Math.sin(r)} y1={cy - 4 * Math.cos(r)} x2={cx + 14 * Math.sin(r)} y2={cy - 14 * Math.cos(r)} />;
    })}
  </g>
);

/** The side elevation: near tires drawn, far tires as hidden lines behind. */
/** The side drawing alone, in the 420 by 190 box from y 4: the far tires dashed, the near ones drawn. */
export function SideDrawing({ soft }: { soft: Record<TirePos, boolean> }) {
  return (
    <>
      <g className="car-guide">
        <line x1="10" y1="152" x2="410" y2="152" />
        <line x1="112" y1="54" x2="112" y2="168" />
        <line x1="313" y1="54" x2="313" y2="168" />
      </g>
      <circle className={`car-hidden ${soft.fr ? 'is-soft' : ''}`} cx="120" cy="124" r="25" />
      <circle className={`car-hidden ${soft.rr ? 'is-soft' : ''}`} cx="321" cy="124" r="25" />
      <path
        className="car-body"
        d="M58 136 C51 130 50 119 55 111 C61 104 88 100 118 96 C143 93 158 91 168 88 C186 72 203 58 226 52 C248 47 280 48 300 54 C323 62 348 76 366 86 C376 92 382 102 382 114 L381 128 C380 133 376 136 370 136 L341 136 A29 29 0 0 0 285 136 L140 136 A29 29 0 0 0 84 136 L64 136 C61 136 59 137 58 136 Z"
      />
      <g className="car-fine">
        <path d="M176 90 C192 75 208 63 229 57 C252 52 280 53 298 59 C318 66 336 77 350 87 Z" />
        <path d="M256 54 L254 89" />
        <path d="M62 112 C140 104 260 100 378 100" />
        <path d="M146 130 L280 130" />
        <path d="M178 92 L172 134 M254 90 L254 134 M318 84 L322 128" />
        <path d="M206 104 l14 0 M282 103 l14 0" />
        <path d="M56 108 C68 103 84 101 98 101 C88 106 72 109 58 111 Z" />
        <path d="M370 92 C376 94 380 98 381 103 L372 102 Z" />
        <path d="M70 100 C110 95 150 92 170 90" />
      </g>
      <path className="car-body" d="M178 92 l-11 -5 l-2 5 l11 3" />
      <Wheel cx={112} cy={128} soft={soft.fl} />
      <Wheel cx={313} cy={128} soft={soft.rl} />
    </>
  );
}

/** Where the side drawing's tires sit, in percent of its box, as a picture's tires do. */
export const SIDE_TIRES: CarPicture['at'] = { fl: [26.7, 65.3], fr: [28.6, 63.2], rl: [74.5, 65.3], rr: [76.4, 63.2] };
/** The drawn car's charge port: rear left, by the tail lamp. */
export const SIDE_PORT: [number, number] = [86.5, 47];

function CarSide({ tires, unit }: { tires: TireReading[]; unit: string }) {
  const t = by(tires);
  return (
    <svg className="car-sketch car-side" viewBox="0 4 420 190">
      <SideDrawing soft={{ fl: t.fl.soft, fr: t.fr.soft, rl: t.rl.soft, rr: t.rr.soft }} />
      {/* Front tires on the left, rear on the right: near ones above, far ones below. */}
      <Callout t={t.fl} x={6} y={28} line="M6 36 L64 36 L98 110" dot={[98, 110]} />
      <Callout t={t.fr} x={6} y={178} line="M6 186 L78 186 L104 146" dot={[104, 146]} />
      <Callout t={t.rl} x={414} y={28} end line="M414 36 L356 36 L326 110" dot={[326, 110]} />
      <Callout t={t.rr} x={414} y={178} end line="M414 186 L362 186 L338 144" dot={[338, 144]} />
    </svg>
  );
}

/** Where each wheel sits on the view from above. */
const WHEEL: Record<TirePos, [number, number]> = { fl: [87, 46], fr: [128, 46], rl: [87, 112], rr: [128, 112] };

/** From above: the plan view, a pressure at each corner. */
function CarAbove({ tires, unit }: { tires: TireReading[]; unit: string }) {
  const t = by(tires);
  return (
    <svg className="car-sketch car-above" viewBox="0 0 220 172">
      <g className="car-guide">
        <line x1="110" y1="4" x2="110" y2="168" />
        <line x1="70" y1="53" x2="150" y2="53" />
        <line x1="70" y1="119" x2="150" y2="119" />
      </g>
      <g className="car-body">
        <path d="M99 24 Q110 20 121 24 Q127 27 127.5 36 L127.5 135 Q127 145 121 148 Q110 151 99 148 Q93 145 92.5 135 L92.5 36 Q93 27 99 24 Z" />
      </g>
      <g className="car-fine">
        <path d="M96.5 54 Q110 48.5 123.5 54 L121.5 64 Q110 60.5 98.5 64 Z" />
        <rect x="98.5" y="65" width="23" height="44" rx="3" />
        <path d="M98.5 110 Q110 113.5 121.5 110 L123.5 119 Q110 124 96.5 119 Z" />
        <path d="M92.5 59 L88.5 57.5 L88.5 61 L92.5 61 M127.5 59 L131.5 57.5 L131.5 61 L127.5 61" />
        <path d="M102 26.5 Q110 24.5 118 26.5" />
      </g>
      {TIRES.map((p) => (
        <rect key={p} className={`car-tread ${t[p].soft ? 'is-soft' : ''}`} x={WHEEL[p][0]} y={WHEEL[p][1]} width="5" height="14" rx="1.6" />
      ))}
      <Callout t={t.fl} x={6} y={34} line="M6 42 L56 42 L86 52" dot={[86, 52]} />
      <Callout t={t.fr} x={214} y={34} end line="M214 42 L164 42 L134 52" dot={[134, 52]} />
      <Callout t={t.rl} x={6} y={138} line="M6 146 L56 146 L86 120" dot={[86, 120]} />
      <Callout t={t.rr} x={214} y={138} end line="M214 146 L164 146 L134 120" dot={[134, 120]} />
    </svg>
  );
}
