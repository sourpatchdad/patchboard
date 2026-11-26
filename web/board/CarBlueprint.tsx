// The car as a live engineering drawing: a general-arrangement sheet with a
// zoned border, the side view large with dimension lines from the model's
// published figures, front, rear and top views where the car has drawings, the
// live metrics, and a row of panels for status, charging, range and tires.
// Every panel and every tire opens its own detail sheet; Back returns to the
// whole car. Everything is drawn in one SVG, so it scales as a piece, on a
// wall tablet, in a dashboard card or on an e-ink reader. Too narrow to read,
// it gives way to `fallback`.

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { artViews } from '../../shared/car-art.ts';
import { type CarPicture, type CarView } from '../../shared/car-pictures.ts';
import { dim, specFor } from '../../shared/car-specs.ts';
import { type Series, TIRES, type TirePos } from '../../shared/types.ts';
import { useJson } from '../lib/api.ts';
import { msg, t as tr } from '../lib/i18n.ts';
import { locale } from '../lib/region.ts';
import { SIDE_PORT, SIDE_TIRES, SideDrawing, type TireReading } from './CarSketch.tsx';
import { type CarCommand, OPENS_CAR } from '../../shared/car-commands.ts';
import { HoldButton } from '../components/Hold.tsx';

/** A part of the car, as the sheet opens it: doors are one, tires are one. */
type Pick = 'doors' | 'frunk' | 'trunk' | 'port' | 'glass' | 'body' | 'tires';

/** An empty cell, as a drawing's table marks one. */
const BLANK = '–';

export interface CarSheet {
  vin: string;
  name: string;
  model?: string;
  /** The built-in drawing (shared/car-art.ts); none draws the outline. */
  art?: string;
  ro: boolean;
  metric: boolean;
  /** "psi" or "bar". */
  unit: string;
  tires: TireReading[];
  /** 0 to 100. */
  battery: number;
  usable?: number;
  limit: number;
  low: boolean;
  range: string;
  rangeMi: number;
  /** "Charging", "Plugged in, not charging", "Unplugged". */
  state: string;
  plugged: boolean;
  charging: boolean;
  kw?: string;
  volts?: number;
  amps?: number;
  added?: string;
  toFull?: string;
  inside?: string;
  outside?: string;
  /** The same, as numbers in Celsius, for the detail's scale. */
  insideC?: number;
  outsideC?: number;
  climate?: boolean;
  locked: boolean;
  /** Doors, frunk or trunk standing open, in words. */
  open: string[];
  sentry: boolean;
  odometer: string;
  /** "4 minutes ago". */
  read: string;
  asleep: boolean;
  /** A low tire, in words. */
  note?: string;
  week: { battery?: Series; tires: Partial<Record<TirePos, Series>> };
  day: { inside?: Series; outside?: Series };
  tireText: (bar: number) => string;
  tempText: (c: number) => string;
  /** Celsius in the unit you read temperatures in, unrounded, for a scale. */
  toTemp: (c: number) => number;
  /** A distance in miles, in the car's own unit. */
  dist: (mi: number) => string;
  /** Your name for the place, or the town. */
  parked?: string;
  lastDrive?: string;
  weekDriven?: string;
  efficiency?: string;
  /** What stands open, part by part, for the drawing and the controls. */
  parts: Partial<Record<'fl' | 'fr' | 'rl' | 'rr' | 'frunk' | 'trunk', boolean>>;
  portOpen?: boolean;
  /** Controls hidden: a read-only server or a household device. */
  noControls: boolean;
}

/** Below this width the sheet's smallest lettering drops under 7px; the regular layout reads better. */
const MIN_WIDTH = 800;

type Detail = 'tires' | 'charge' | 'range' | 'climate' | 'status';
type Layer = { pick: Pick } | { detail: Detail };
const DETAIL: Record<Detail, [string, string]> = {
  tires: ['A', msg('Tire pressure')],
  charge: ['B', msg('Charging')],
  range: ['C', msg('Range')],
  climate: ['D', msg('Climate')],
  status: ['E', msg('Status')],
};

export function CarBlueprint({ sheet, fallback }: { sheet: CarSheet; fallback: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pics = artViews(sheet.art);
  // What's open over the sheet: a part beside it, or a detail in its place. Each is a step in the
  // browser's history, so Back (a TV remote's, a phone's) closes it rather than leaving the page.
  const [layer, setLayerNow] = useState<Layer | null>(null);
  useEffect(() => {
    // A reload starts on the whole car, never on whatever was open before it.
    if (history.state?.bpLayer) history.replaceState({ ...history.state, bpLayer: undefined }, '');
    const pop = () => setLayerNow(history.state?.bpLayer ?? null);
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  // The marked stop a layer opened from, by its place on the sheet: closing the layer marks it
  // again, so a remote carries on from there instead of from the top.
  const openedFrom = useRef(-1);
  const stopsOnSheet = () => [...(wrap.current?.querySelectorAll<HTMLElement | SVGElement>('.bp-stop, .bp-turntable[tabindex]') ?? [])];
  useEffect(() => {
    if (layer || openedFrom.current < 0) return;
    const on = document.activeElement;
    if (!on || on === document.body) stopsOnSheet()[openedFrom.current]?.focus({ preventScroll: true });
    openedFrom.current = -1;
  }, [layer]);
  const setLayer = (next: Layer | null) => {
    const had = !!history.state?.bpLayer;
    if (next && !had) openedFrom.current = stopsOnSheet().indexOf(document.activeElement as HTMLElement);
    if (!next) {
      if (had) history.back();
      else setLayerNow(null);
      return;
    }
    // A detail opened from a part takes the part's place: one Back returns to the car.
    if (had) history.replaceState({ ...history.state, bpLayer: next }, '');
    else history.pushState({ ...history.state, bpLayer: next }, '');
    setLayerNow(next);
  };
  const detail = layer && 'detail' in layer ? layer.detail : null;
  const pick = layer && 'pick' in layer ? layer.pick : null;
  const setDetail = (d: Detail | null) => setLayer(d ? { detail: d } : null);
  const setPick = (p: Pick | null) => setLayer(p ? { pick: p } : null);
  const [big, setBig] = useState<CarView>('side');
  // Alone on a screen (a poster) that's squarer than 16:9, the way most e-ink frames are, the sheet goes 4:3 and fills it.
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const fit = () => setTall(!!wrap.current?.closest('.widget-page') && innerWidth / innerHeight < 1.55);
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  // Escape leaves a detail sheet, as Back does.
  useEffect(() => {
    if (!detail) return;
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setDetail(null);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [detail]);
  return (
    <div ref={wrap} className="bp-wrap">
      {width < MIN_WIDTH ? (
        fallback
      ) : detail ? (
        <DetailSheet sheet={sheet} pics={pics} detail={detail} onBack={() => setDetail(null)} tall={tall} />
      ) : (
        <Sheet sheet={sheet} pics={pics} open={setDetail} pick={pick} setPick={setPick} big={big} turn={setBig} tall={tall} />
      )}
    </div>
  );
}

/** A picture's size, the part of it to show, and where its drawing is, in its own pixels. */
interface Framed {
  w: number;
  h: number;
  crop: { x: number; y: number; w: number; h: number };
  /** The drawing's own extent inside the crop: where the car begins and ends. */
  ink: { x: number; y: number; w: number; h: number };
}

/** A built-in view's frame. Each drawing is trimmed to the car, so its part and its ink are the whole image, sized from its aspect without waiting for it to load. */
function framedOf(pic: CarPicture | null): Framed | null {
  if (!pic) return null;
  const h = 1000;
  const all = { x: 0, y: 0, w: Math.round((pic.aspect ?? 2) * h), h };
  return { w: all.w, h, crop: all, ink: all };
}

/** The side drawing's own box, as if it were a picture. */
const DRAWN: Framed = { w: 420, h: 190, crop: { x: 44, y: 44, w: 346, h: 128 }, ink: { x: 50, y: 48, w: 333, h: 104 } };

type Box = { x: number; y: number; w: number; h: number };

/** A view fitted into its place on the sheet, centered; and where a spot in the picture lands. */
function place(framed: Framed, slot: Box) {
  const { crop } = framed;
  const aspect = crop.w / crop.h;
  const w = Math.min(slot.w, slot.h * aspect);
  const h = w / aspect;
  const box = { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
  const px = (nx: number, ny: number): [number, number] => [box.x + ((nx - crop.x) / crop.w) * box.w, box.y + ((ny - crop.y) / crop.h) * box.h];
  const at = (xy: [number, number]): [number, number] => px((xy[0] / 100) * framed.w, (xy[1] / 100) * framed.h);
  const ink = { x0: px(framed.ink.x, framed.ink.y)[0], y0: px(framed.ink.x, framed.ink.y)[1], x1: px(framed.ink.x + framed.ink.w, 0)[0], y1: px(0, framed.ink.y + framed.ink.h)[1] };
  return { box, at, ink };
}

/** One view of the car: your picture, cropped to its part, or the drawn side view. */
function ViewImage({ pic, framed, box, soft, motion = '' }: { pic: CarPicture | null; framed: Framed; box: Box; soft: Record<TirePos, boolean>; motion?: string }) {
  const { crop } = framed;
  // The view's part, clipped on the image itself: it travels with the image as it turns, so nothing
  // from beyond the box slides in, and the image keeps its blend with the paper.
  const clip = `bp-crop-${useId().replace(/:/g, '')}`;
  const clipDef = (
    <defs>
      <clipPath id={clip}>
        <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} />
      </clipPath>
    </defs>
  );
  return pic ? (
    <svg x={box.x} y={box.y} width={box.w} height={box.h} viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none" className="bp-view">
      {clipDef}
      {/* Only the image moves when the car turns, about the middle of its own part: animating anything around it would cut its blend with the paper. */}
      <image
        href={pic.src}
        x="0"
        y="0"
        width={framed.w}
        height={framed.h}
        className={`bp-img is-drawing ${motion}`}
        clipPath={`url(#${clip})`}
        style={{ transformOrigin: `${crop.x + crop.w / 2}px ${crop.y + crop.h / 2}px` }}
      />
    </svg>
  ) : (
    <svg x={box.x} y={box.y} width={box.w} height={box.h} viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} className="bp-view bp-drawn">
      {clipDef}
      <g className={motion} clipPath={`url(#${clip})`} style={{ transformOrigin: `${crop.x + crop.w / 2}px ${crop.y + crop.h / 2}px` }}>
        <SideDrawing soft={soft} />
      </g>
    </svg>
  );
}

/** A dimension line: arrowheads, extension ticks, and the figure centered on it. */
function Dimension({ x0, y0, x1, y1, text, vertical }: { x0: number; y0: number; x1: number; y1: number; text: string; vertical?: boolean }) {
  const a = 1.3;
  return (
    <g className="bp-dim">
      <line x1={x0} y1={y0} x2={x1} y2={y1} />
      {vertical ? (
        <>
          <path d={`M${x0 - a / 1.6} ${y0 + a} L${x0} ${y0} L${x0 + a / 1.6} ${y0 + a} M${x1 - a / 1.6} ${y1 - a} L${x1} ${y1} L${x1 + a / 1.6} ${y1 - a}`} />
          <path d={`M${x0 - 2} ${y0} H${x0 + 2} M${x1 - 2} ${y1} H${x1 + 2}`} />
          <text className="bp-dim-text" x={x0 + 2.2} y={(y0 + y1) / 2 + 1}>
            {text}
          </text>
        </>
      ) : (
        <>
          <path d={`M${x0 + a} ${y0 - a / 1.6} L${x0} ${y0} L${x0 + a} ${y0 + a / 1.6} M${x1 - a} ${y1 - a / 1.6} L${x1} ${y1} L${x1 - a} ${y1 + a / 1.6}`} />
          <path d={`M${x0} ${y0 - 2} V${y0 + 2} M${x1} ${y1 - 2} V${y1 + 2}`} />
          <text className="bp-dim-text" x={(x0 + x1) / 2} y={y0 - 1.2} textAnchor="middle">
            {text}
          </text>
        </>
      )}
    </g>
  );
}

/** A tappable part of the sheet: a button for a pointer, the keyboard and a screen reader. */
function Hit({ label, onOpen, children, className = '' }: { label: string; onOpen: () => void; children: ReactNode; className?: string }) {
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <g className={`bp-hit ${className}`} role="button" tabIndex={0} aria-label={label} onClick={onOpen} onKeyDown={key}>
      {children}
    </g>
  );
}

/** Small line icons for the metrics, drawn in a 6 by 6 box. */
const ICONS: Record<string, string> = {
  charge: 'M0.5 1.5 H5 V4.5 H0.5 Z M5 2.5 H5.8 V3.5 H5 M1.4 2.3 V3.7 M2.4 2.3 V3.7 M3.4 2.3 V3.7',
  range: 'M3 5.6 C1.2 3.6 0.9 2.9 0.9 2.1 A2.1 2.1 0 0 1 5.1 2.1 C5.1 2.9 4.8 3.6 3 5.6 Z M3 1.4 A0.7 0.7 0 1 0 3 2.8 A0.7 0.7 0 1 0 3 1.4',
  power: 'M3.6 0.4 L1.2 3.4 H2.9 L2.3 5.6 L4.8 2.5 H3.1 Z',
  cabin: 'M3 3 C3 1.4 3.6 0.6 4.4 0.8 C5 1 4.8 2.4 3 3 C4.6 3 5.4 3.6 5.2 4.4 C5 5 3.6 4.8 3 3 C3 4.6 2.4 5.4 1.6 5.2 C1 5 1.2 3.6 3 3 C1.4 3 0.6 2.4 0.8 1.6 C1 1 2.4 1.2 3 3',
  outside: 'M2.4 0.6 H3.6 V3.6 A1.4 1.4 0 1 1 2.4 3.6 Z M3 2 V4.4',
};

export const W = 320;
/** The sheet's height in its own units: 16:9 on boards and wide screens, 4:3 as a poster on a squarer one. */
const WIDE = 180;
const TALL = 240;

/** One view of the car, ready to place: its picture (none for the drawn side), framing, tires and port. */
interface View {
  v: CarView;
  pic: CarPicture | null;
  framed: Framed | null;
  at: CarPicture['at'];
  port: [number, number] | null | undefined;
  label: string;
}

function Sheet({
  sheet,
  pics,
  open,
  pick,
  setPick,
  big,
  turn,
  tall,
}: {
  sheet: CarSheet;
  pics: CarPicture[];
  open: (d: Detail) => void;
  pick: Pick | null;
  setPick: (p: Pick | null) => void;
  big: CarView;
  turn: (v: CarView) => void;
  tall: boolean;
}) {
  const H = tall ? TALL : WIDE;
  // Where the extra height of a 4:3 sheet goes: a larger car, taller views, roomier rows and panels.
  const rowStep = tall ? 22 : 15.4;
  const rowPad = (rowStep - 15.4) / 2;
  const stage = useRef<HTMLDivElement>(null);
  const [u, setU] = useState(3);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setU(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!pick) return;
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setPick(null);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pick]);
  const id = useId().replace(/:/g, '');
  const byView = (v: CarView) => pics.find((p) => p.view === v) ?? null;
  const sidePic = byView('side') ?? pics.find((p) => !p.view) ?? null;
  const topPic = byView('top');
  const frontPic = byView('front');
  const rearPic = byView('rear');
  const front34Pic = byView('front34');
  const rear34Pic = byView('rear34');
  const front34Framed = framedOf(front34Pic);
  const rear34Framed = framedOf(rear34Pic);
  const sideLoaded = framedOf(sidePic);
  const topFramed = framedOf(topPic);
  const frontFramed = framedOf(frontPic);
  const rearFramed = framedOf(rearPic);
  const sideFramed = sidePic ? sideLoaded : DRAWN;
  const soft = Object.fromEntries(sheet.tires.map((t) => [t.pos, t.soft])) as Record<TirePos, boolean>;
  const tire = Object.fromEntries(sheet.tires.map((t) => [t.pos, t])) as Record<TirePos, TireReading>;
  const spec = specFor(sheet.model);
  // Every view there is, in the order the car turns through them. The side always is: your picture or the drawn one.
  const sideView: View = { v: 'side', pic: sidePic, framed: sideFramed, at: sidePic ? sidePic.at : SIDE_TIRES, port: sidePic ? sidePic.port : SIDE_PORT, label: msg('Side view') };
  const others = (
    [
      ['front', frontPic, frontFramed, msg('Front view')],
      ['front34', front34Pic, front34Framed, msg('Front three-quarter')],
      ['rear34', rear34Pic, rear34Framed, msg('Rear three-quarter')],
      ['rear', rearPic, rearFramed, msg('Rear view')],
      ['top', topPic, topFramed, msg('Top view')],
    ] as const
  )
    .filter(([, p]) => p)
    .map(([v, p, framed, label]): View => ({ v, pic: p, framed, at: p!.at, port: p!.port, label }));
  const views: View[] = TURN.map((v) => (v === 'side' ? sideView : others.find((o) => o.v === v))).filter((x): x is View => !!x);
  // The large view is the one you turned to, while it's there; the rest go across the top.
  const large = views.find((x) => x.v === big) ?? sideView;
  const at = views.indexOf(large);
  const step = (d: 1 | -1) => views.length > 1 && turn(views[(at + d + views.length) % views.length].v);
  // The view it turned from leaves while the new one comes in, the way it turned.
  // Which view it turned from, by name: its drawing is looked up now, so a picture that loaded since is the one that leaves.
  const [leaving, setLeaving] = useState<{ v: CarView; dir: 1 | -1 } | null>(null);
  const was = useRef(large.v);
  useEffect(() => {
    const prev = was.current;
    was.current = large.v;
    if (prev === large.v || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-eink')) return;
    const i = views.findIndex((x) => x.v === prev);
    const n = views.length;
    const dir: 1 | -1 = i < 0 ? 1 : (at - i + n) % n <= n / 2 ? 1 : -1;
    setLeaving({ v: prev, dir });
    const t = window.setTimeout(() => setLeaving(null), 380);
    return () => window.clearTimeout(t);
  }, [large.v]);
  // A poster on a TV, driven by its remote: up and down step through the metrics, the car and the
  // panels (or an open part's buttons), the center button opens what's marked, and left and right
  // turn the car: at once on a screen with one page, and once the car is marked on one with several.
  useEffect(() => {
    if (!stage.current?.closest('.widget-page')) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const on = document.activeElement;
      if (on && on !== document.body && !stage.current?.contains(on)) return;
      // With pages to turn, left and right are the pages'; the car turns once it's highlighted.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !document.documentElement.classList.contains('wall-swipe')) {
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const stops = [...(stage.current?.querySelectorAll<HTMLElement | SVGElement>(pick ? '.bp-part button:not(:disabled)' : '.bp-stop, .bp-turntable[tabindex]') ?? [])];
        if (!stops.length) return;
        e.preventDefault();
        const i = stops.indexOf(on as HTMLElement);
        const down = e.key === 'ArrowDown';
        stops[i < 0 ? (down ? 0 : stops.length - 1) : (i + (down ? 1 : -1) + stops.length) % stops.length].focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  // Swipe or drag across it to turn it; a drag never counts as a tap on a part.
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  // How far the car leans with a drag, in the sheet's units: a little, and less the further it goes.
  const [lean, setLean] = useState(0);
  const onDown = (e: PointerEvent<SVGGElement>) => {
    drag.current = { x: e.clientX, moved: false };
    dragged.current = false;
  };
  const onMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || views.length < 2) return;
    const dx = (e.clientX - d.x) / u;
    setLean(Math.sign(dx) * Math.min(8, Math.sqrt(Math.abs(dx)) * 1.6));
  };
  const onUp = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    drag.current = null;
    setLean(0);
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 28) {
      dragged.current = true;
      step(dx < 0 ? 1 : -1);
    }
  };
  const shown = views.filter((x) => x !== large);
  // The row of small views runs from 104 to 308, inside the zone border, gaps and all.
  const slotW = shown.length ? Math.min(66, (204 - 4 * (shown.length - 1)) / shown.length) : 0;

  // The large view: in the middle, higher up when there's no row of small views above it.
  const mainSlot = tall
    ? shown.length
      ? { x: 104, y: 74, w: 184, h: 80 }
      : { x: 104, y: 30, w: 184, h: 132 }
    : shown.length
      ? { x: 108, y: 64, w: 176, h: 52 }
      : { x: 104, y: 30, w: 184, h: 84 };
  const side = large.framed ? place(large.framed, mainSlot) : null;
  const flippedOf = (view: View) => {
    const f = view.at.fl ?? view.at.fr;
    const r = view.at.rl ?? view.at.rr;
    return !!(f && r && f[0] > r[0]);
  };
  const isOpen: Partial<Record<Pick, boolean>> = {
    doors: !!(sheet.parts.fl || sheet.parts.fr || sheet.parts.rl || sheet.parts.rr),
    frunk: !!sheet.parts.frunk,
    trunk: !!sheet.parts.trunk,
  };
  const sideAt = large.at;
  const portXY = large.port;

  const metrics: [keyof typeof ICONS, string, string, string | undefined, Detail, boolean?][] = [
    ['charge', tr('Charge'), `${sheet.battery}%`, sheet.usable != null && sheet.usable !== sheet.battery ? tr('{n}% usable', { n: sheet.usable }) : undefined, 'charge', sheet.low],
    ['range', tr('Range'), sheet.range, undefined, 'range'],
    ['power', tr('Power'), sheet.charging && sheet.kw ? sheet.kw : BLANK, tr(sheet.state), 'charge'],
    ['cabin', tr('Cabin'), sheet.inside ?? BLANK, sheet.climate ? tr('Climate on') : undefined, 'climate'],
    ['outside', tr('Outside'), sheet.outside ?? BLANK, undefined, 'climate'],
  ];
  const full = sheet.battery > 0 ? Math.round((sheet.rangeMi / sheet.battery) * 100) : 0;
  const panels = tall ? { y: 168, h: 61, w: 72, gap: 4 } : { y: 132, h: 36, w: 72, gap: 4 };
  // A panel's rows of figures: where the first sits, and how far apart.
  const cell = tall ? { first: 19, step: 10.5 } : { first: 14, step: 6.2 };
  const px = (i: number) => 12 + i * (panels.w + panels.gap);

  return (
    <div ref={stage} className="bp-stage" style={{ '--u': `${u}px`, '--ratio': W / H } as CSSProperties}>
    <svg className="bp-sheet" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${sheet.model ?? sheet.name}: ${tr('engineering drawing')}`}>
      <Frame id={id} H={H} />

      {/* Title, top left: shortened to the space the sheet gives it, the whole name kept for a reader and on hover. */}
      <text className="bp-title" x="13" y="22">
        <title>{sheet.model ?? sheet.name}</title>
        {clip(sheet.model ?? sheet.name, 11)}
      </text>
      {/* Under it, as a drawing's title block names what it shows: whose car, and how far it's gone. */}
      <text className="bp-small" x="13.4" y="28">
        <title>{`${sheet.model ? `${sheet.name} · ` : ''}${tr('Odometer')} ${sheet.odometer}`}</title>
        {sheet.model ? `${clip(sheet.name, Math.max(8, 36 - tr('Odometer').length - sheet.odometer.length - 4))} · ` : ''}
        {tr('Odometer')} {sheet.odometer}
      </text>
      <line className="bp-rule" x1="13" y1="31" x2="92" y2="31" />

      {/* Live metrics: a boxed list, each row opening its detail. */}
      <rect className="bp-box" x="12" y="36" width="82" height={10 + rowStep * 5 + 1} />
      <text className="bp-row" x="16" y="42.5">
        {tr('Live metrics')}
      </text>
      <line className="bp-rule" x1="12" y1="45" x2="94" y2="45" />
      {metrics.map(([icon, label, value, sub, d, trouble], i) => {
        const y = 47 + i * rowStep;
        return (
          <Hit key={icon} label={`${label} ${value}${sub ? `, ${sub}` : ''}`} onOpen={() => open(d)} className="bp-stop">
            <rect className="bp-hit-area" x="12.5" y={y} width="81" height={rowStep - 0.4} />
            <path className="bp-icon" d={ICONS[icon]} transform={`translate(15 ${y + rowPad + 4.4})`} />
            <text className="bp-row" x="24" y={y + rowPad + 8.8}>
              {label}
            </text>
            <text className={`bp-metric ${trouble ? 'is-soft' : ''}`} x="90" y={y + rowPad + (sub ? 7.6 : 9.6)} textAnchor="end">
              {value}
            </text>
            {sub && (
              <text className="bp-tiny" x="90" y={y + rowPad + 12.2} textAnchor="end">
                {sub}
              </text>
            )}
            {i < metrics.length - 1 && <line className="bp-rule-soft" x1="15" y1={y + rowStep - 0.2} x2="91" y2={y + rowStep - 0.2} />}
          </Hit>
        );
      })}

      {/* The small views across the top, each with its label; tap one to bring it to the middle.
          A side or top view carries the length. */}
      {shown.map(({ v, pic, framed, label }, i) => {
        if (!framed) return null;
        const slot = { x: 104 + i * (slotW + 4), y: 18, w: slotW, h: tall ? 42 : 30 };
        const p = place(framed, slot);
        return (
          <g key={v}>
            {/* The picture sits outside the button, so its uncropped edges don't count toward its size. */}
            <ViewImage pic={pic} framed={framed} box={p.box} soft={soft} motion={leaving ? 'bp-row-in' : ''} />
            <Hit label={tr('Show the {view} large', { view: tr(label) })} onOpen={() => turn(v)}>
              <rect className="bp-hit-area" x={slot.x} y={slot.y - 2} width={slot.w} height={slot.h + 12} />
              {/* A small view carries the length while there's room; with a full row, the large view's dimensions say it. */}
              {(v === 'top' || v === 'side') && spec && shown.length <= 3 && <Dimension x0={p.ink.x0} y0={14} x1={p.ink.x1} y1={14} text={dim(spec.length, locale())} />}
              <text className="bp-label-u" x={p.box.x + p.box.w / 2} y={tall ? 67 : 55} textAnchor="middle">
                {tr(label)}
              </text>
              <line className="bp-rule" x1={p.box.x + p.box.w / 2 - 11} y1={tall ? 68.4 : 56.4} x2={p.box.x + p.box.w / 2 + 11} y2={tall ? 68.4 : 56.4} />
            </Hit>
          </g>
        );
      })}

      {/* The large view, dimensioned underneath and on its right: the side and top views along
          their length, the side, front and rear views in height. */}
      {/* The large view, on a turntable: swipe across it, or press the arrow keys, to turn the car to the next view. */}
      {(() => {
        const gone = leaving && views.find((x) => x.v === leaving.v);
        return (
          gone?.framed && (
            <g aria-hidden="true">
              <ViewImage pic={gone.pic} framed={gone.framed} box={place(gone.framed, mainSlot).box} soft={soft} motion={`bp-leave ${leaving!.dir > 0 ? 'is-next' : 'is-back'}`} />
            </g>
          )
        );
      })()}
      {side && large.framed && (
        // Kept in place as the car turns (never re-mounted), so keyboard focus stays on it from one view to the next.
        <g
          className="bp-turntable"
          role="group"
          tabIndex={views.length > 1 ? 0 : undefined}
          aria-label={tr('{view}. Turn the car with the arrow keys or a swipe.', { view: tr(large.label) })}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            drag.current = null;
            setLean(0);
          }}
          onClickCapture={(e) => {
            if (dragged.current) {
              e.stopPropagation();
              dragged.current = false;
            }
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              step(e.key === 'ArrowRight' ? 1 : -1);
            }
          }}
        >
          <rect className="bp-turn-pad" x={mainSlot.x - 4} y={mainSlot.y - 2} width={mainSlot.w + 8} height={mainSlot.h + 4} />
          <g transform={lean ? `translate(${lean} 0)` : undefined}>
            <ViewImage pic={large.pic} framed={large.framed} box={side.box} soft={soft} motion={leaving ? `bp-enter ${leaving.dir > 0 ? 'is-next' : 'is-back'}` : ''} />
          </g>
          <g className={leaving ? 'bp-marks-in' : undefined} opacity={lean ? 0.35 : undefined}>
          {spec &&
            (() => {
              const x0 = side.ink.x0;
              const x1 = side.ink.x1;
              const y = side.ink.y1 + 4.5;
              const len = x1 - x0;
              const along = large.v === 'side' || large.v === 'top';
              const tall = large.v === 'side' || large.v === 'front' || large.v === 'rear';
              const fx = sideAt.fl ?? sideAt.fr;
              const rx = sideAt.rl ?? sideAt.rr;
              const front = spec.front ?? spec.length * 0.18;
              let fl = fx ? side.at(fx)[0] : x0 + (len * front) / spec.length;
              let rl = rx ? side.at(rx)[0] : x0 + (len * (front + spec.wheelbase)) / spec.length;
              // A picture drawn facing right: the rear overhang comes first.
              const flipped = fl > rl;
              if (flipped) [fl, rl] = [rl, fl];
              const [first, last] = flipped ? [spec.rear, spec.front] : [spec.front, spec.rear];
              return (
                <>
                  {along && (
                    <>
                      {first && <Dimension x0={x0} y0={y} x1={fl} y1={y} text={dim(first, locale())} />}
                      <Dimension x0={fl} y0={y} x1={rl} y1={y} text={dim(spec.wheelbase, locale())} />
                      {last && <Dimension x0={rl} y0={y} x1={x1} y1={y} text={dim(last, locale())} />}
                      <Dimension x0={x0} y0={y + 6} x1={x1} y1={y + 6} text={dim(spec.length, locale())} />
                    </>
                  )}
                  {tall && <Dimension x0={x1 + 5} y0={side.ink.y0} x1={x1 + 5} y1={side.ink.y1} text={dim(spec.height, locale())} vertical />}
                </>
              );
            })()}
          {/* The parts on this view: tap one to open it. Each shows its outline, as a drawing marks a detail, when it's open or chosen. */}
          {(REGIONS[large.v] ?? []).map(([part, fx0, fx1, fy0, fy1]) => {
            const { x0, x1, y0, y1 } = side.ink;
            const flip = flippedOf(large);
            const ax = (f: number) => (flip ? x1 - f * (x1 - x0) : x0 + f * (x1 - x0));
            const rx = Math.min(ax(fx0), ax(fx1));
            const rw = Math.abs(ax(fx1) - ax(fx0));
            const ry = y1 - fy1 * (y1 - y0);
            const rh = (fy1 - fy0) * (y1 - y0);
            const opened = isOpen[part];
            const word = tr(REGION_WORDS[part] ?? PICK_WORDS[part]);
            return (
              <Hit key={part} label={`${word}${opened ? `: ${tr('Open')}` : ''}`} onOpen={() => setPick(part)}>
                <g className={`bp-region ${opened ? 'is-open' : ''} ${pick === part ? 'is-on' : ''}`}>
                  <rect className="bp-region-box" x={rx} y={ry} width={rw} height={rh} rx="1.2" fill={opened ? `url(#${id}-hatch)` : undefined} />
                  <text className={`bp-region-tag ${opened ? 'is-soft' : ''}`} x={rx + 1} y={ry - 1}>
                    {opened ? `${word} · ${tr('Open')}` : word}
                  </text>
                </g>
              </Hit>
            );
          })}
          {/* Tires on the view: a tap target over each tire that shows. */}
          {TIRES.map((t) => {
            const xy = sideAt[t];
            // No reading yet (Tessie has none until the car measures after waking): no ring to tap.
            if (!xy || !tire[t]) return null;
            const [cx, cy] = side.at(xy);
            return (
              <Hit key={t} label={`${tire[t].name} ${tire[t].value} ${sheet.unit}`} onOpen={() => setPick('tires')}>
                <circle className={`bp-tire-ring ${tire[t].soft ? 'is-soft' : ''}`} cx={cx} cy={cy} r={Math.min(side.box.h * 0.2, side.box.w * 0.06)} />
              </Hit>
            );
          })}
          {/* The charge port, unplugged: a small mark to tap, so it can be opened from here. */}
          {!sheet.plugged &&
            portXY &&
            (() => {
              const [cx, cy] = side.at(portXY);
              return (
                <Hit label={tr('Charge port')} onOpen={() => setPick('port')}>
                  {/* A finger-sized target around the small mark. */}
                  <circle className="bp-hit-area" cx={cx} cy={cy} r="4.5" />
                  <g className={`bp-region ${pick === 'port' ? 'is-on' : ''}`}>
                    <circle className="bp-region-box" cx={cx} cy={cy} r="3" />
                    <text className="bp-region-tag" x={cx - 3} y={cy - 4}>
                      {tr('Charge port')}
                    </text>
                  </g>
                </Hit>
              );
            })()}
          {/* The charge port, called out while it's plugged in: the leader rises
              up and back over the car, clear of the height dimension on the right. */}
          {sheet.plugged &&
            portXY &&
            (() => {
              const [cx, cy] = side.at(portXY);
              const ex = Math.max(side.box.x + 40, cx - 8);
              const ly = side.box.y - 1;
              const sx = ex - 34;
              return (
                <Hit label={`${tr('Charge port')}: ${tr(sheet.state)}${sheet.kw ? `, ${sheet.kw}` : ''}`} onOpen={() => setPick('port')}>
                  {/* The label is what a finger aims at: a target the size of it, and one round the port itself. */}
                  <rect className="bp-hit-area bp-callout-hit" x={sx - 1} y={ly - 9} width={ex - sx + 2} height="10" />
                  <circle className="bp-hit-area" cx={cx} cy={cy} r="4" />
                  <circle className="bp-dot" cx={cx} cy={cy} r="0.8" />
                  <path className="bp-lead" d={`M${cx} ${cy} L${ex} ${ly} H${sx}`} />
                  {sheet.charging && <path className="bp-cable-flow" d={`M${sx} ${ly} H${ex} L${cx} ${cy}`} />}
                  <path className="bp-icon" d={ICONS.power} transform={`translate(${ex - 6} ${ly - 7.4})`} />
                  <text className="bp-small" x={ex - 7} y={ly - 2.6} textAnchor="end">
                    {sheet.charging && sheet.kw ? `${tr('Charging')} ${sheet.kw}` : tr('Plugged in')}
                  </text>
                </Hit>
              );
            })()}
          </g>
          {/* The way round, when there's more than one view: a quiet turn mark either side. */}
          {views.length > 1 && (
            <>
              <Hit label={tr('Turn the car back')} onOpen={() => step(-1)}>
                <path className="bp-turn-mark" d={`M${mainSlot.x - 1} ${mainSlot.y + mainSlot.h / 2 - 3} l-2.4 3 l2.4 3`} />
                <rect className="bp-hit-area" x={mainSlot.x - 6} y={mainSlot.y + mainSlot.h / 2 - 6} width="8" height="12" />
              </Hit>
              <Hit label={tr('Turn the car on')} onOpen={() => step(1)}>
                <path className="bp-turn-mark" d={`M${mainSlot.x + mainSlot.w + 1} ${mainSlot.y + mainSlot.h / 2 - 3} l2.4 3 l-2.4 3`} />
                <rect className="bp-hit-area" x={mainSlot.x + mainSlot.w - 2} y={mainSlot.y + mainSlot.h / 2 - 6} width="8" height="12" />
              </Hit>
            </>
          )}
        </g>
      )}

      {/* The row of panels along the bottom. */}
      <Hit label={`${tr('Status')}: ${sheet.locked ? tr('Locked') : tr('Unlocked')}`} onOpen={() => setPick('body')} className="bp-stop">
        <rect className="bp-box bp-hit-area" x={px(0)} y={panels.y} width={panels.w} height={panels.h} />
        <text className="bp-row" x={px(0) + 3} y={panels.y + 6}>
          {tr('Status')}
        </text>
        <line className="bp-rule" x1={px(0)} y1={panels.y + 8} x2={px(0) + panels.w} y2={panels.y + 8} />
        {(
          [
            sheet.open.length ? [tr('Open'), sheet.open.join(', '), true] : [tr('Doors'), sheet.locked ? tr('Locked') : tr('Unlocked'), !sheet.locked],
            [tr('Sentry'), sheet.sentry ? tr('On') : tr('Off')],
            sheet.parked ? [tr('Parked'), sheet.parked] : [tr('Odometer'), sheet.odometer],
            [sheet.asleep ? tr('Asleep, read') : tr('Read'), sheet.read],
          ] as [string, string, boolean?][]
        ).map(([k, v, trouble], i) => (
          <g key={k}>
            <text className="bp-tiny" x={px(0) + 3} y={panels.y + cell.first + i * cell.step}>
              {k}
            </text>
            <text className={`bp-cell-s ${trouble ? 'is-soft' : ''}`} x={px(0) + panels.w - 3} y={panels.y + cell.first + i * cell.step} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
      </Hit>

      <Hit label={`${tr('Charging')}: ${tr(sheet.state)}`} onOpen={() => setPick('port')} className="bp-stop">
        <rect className="bp-box bp-hit-area" x={px(1)} y={panels.y} width={panels.w} height={panels.h} />
        <text className="bp-row" x={px(1) + 3} y={panels.y + 6}>
          {tr('Charging')}
        </text>
        <line className="bp-rule" x1={px(1)} y1={panels.y + 8} x2={px(1) + panels.w} y2={panels.y + 8} />
        {(
          [
            [tr('State'), tr(sheet.state)],
            [tr('Rate'), sheet.charging && sheet.kw ? `${sheet.kw}${sheet.volts && sheet.amps ? ` · ${sheet.volts} V ${sheet.amps} A` : ''}` : BLANK],
            [tr('Added'), sheet.added ?? BLANK],
            [sheet.toFull ? tr('Full in') : tr('Limit'), sheet.toFull ?? `${sheet.limit}%`],
          ] as [string, string][]
        ).map(([k, v], i) => (
          <g key={k}>
            <text className="bp-tiny" x={px(1) + 3} y={panels.y + cell.first + i * cell.step}>
              {k}
            </text>
            <text className="bp-cell-s" x={px(1) + panels.w - 3} y={panels.y + cell.first + i * cell.step} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
      </Hit>

      {/* Range at each charge level, from this car's own range and charge; the limit and now marked. */}
      <Hit label={`${tr('Range')}: ${sheet.range}`} onOpen={() => open('range')} className="bp-stop">
        <rect className="bp-box bp-hit-area" x={px(2)} y={panels.y} width={panels.w} height={panels.h} />
        <text className="bp-row" x={px(2) + 3} y={panels.y + 6}>
          {tr('Range by charge')}
        </text>
        <line className="bp-rule" x1={px(2)} y1={panels.y + 8} x2={px(2) + panels.w} y2={panels.y + 8} />
        {(() => {
          const g = { x: px(2) + 10, y: panels.y + 11, w: panels.w - 15, h: panels.h - 18 };
          const at = (pct: number): [number, number] => [g.x + (g.w * pct) / 100, g.y + g.h - (g.h * pct) / 100];
          const now = at(sheet.battery);
          const lim = at(sheet.limit);
          return (
            <>
              <path className="bp-axis" d={`M${g.x} ${g.y} V${g.y + g.h} H${g.x + g.w}`} />
              <line className="bp-lead" x1={g.x} y1={g.y + g.h} x2={g.x + g.w} y2={g.y} />
              <line className="bp-limit" x1={lim[0]} y1={g.y} x2={lim[0]} y2={g.y + g.h} />
              <circle className="bp-dot" cx={now[0]} cy={now[1]} r="0.9" />
              <text className="bp-tiny" x={g.x - 1} y={g.y + 1.6} textAnchor="end">
                {full}
              </text>
              <text className="bp-tiny" x={g.x - 1} y={g.y + g.h} textAnchor="end">
                0
              </text>
              <text className="bp-tiny" x={g.x + g.w} y={g.y + g.h + 3.4} textAnchor="end">
                100%
              </text>
              <text className="bp-tiny" x={g.x} y={g.y + g.h + 3.4}>
                0%
              </text>
            </>
          );
        })()}
      </Hit>

      {/* Tire pressure: the car from above, a pressure at each corner. */}
      <Hit label={sheet.tires.length ? `${tr('Tire pressure')}: ${sheet.tires.map((t) => `${t.name} ${t.value}`).join(', ')} ${sheet.unit}` : `${tr('Tire pressure')}: ${tr('Not measured yet')}`} onOpen={() => open('tires')} className="bp-stop">
        <rect className="bp-box bp-hit-area" x={px(3)} y={panels.y} width={panels.w} height={panels.h} />
        <text className="bp-row" x={px(3) + 3} y={panels.y + 6}>
          {tr('Tire pressure')}
        </text>
        <line className="bp-rule" x1={px(3)} y1={panels.y + 8} x2={px(3) + panels.w} y2={panels.y + 8} />
        {(() => {
          const cx = px(3) + panels.w / 2;
          // The plan keeps a car's shape however tall the panel: centered in the room it has.
          const planH = Math.min(panels.h - 13, 30);
          const car = { x: cx - 5, y: panels.y + 10.5 + (panels.h - 13 - planH) / 2, w: 10, h: planH };
          const corner: Record<TirePos, [number, number, boolean]> = {
            fl: [car.x - 1, car.y + 5, true],
            fr: [car.x + car.w + 1, car.y + 5, false],
            rl: [car.x - 1, car.y + car.h - 5, true],
            rr: [car.x + car.w + 1, car.y + car.h - 5, false],
          };
          return (
            <>
              <path className="bp-plan" d={`M${car.x + 2} ${car.y} Q${cx} ${car.y - 1} ${car.x + car.w - 2} ${car.y} Q${car.x + car.w} ${car.y + 1} ${car.x + car.w} ${car.y + 4} V${car.y + car.h - 3} Q${car.x + car.w} ${car.y + car.h} ${car.x + car.w - 2.5} ${car.y + car.h} H${car.x + 2.5} Q${car.x} ${car.y + car.h} ${car.x} ${car.y + car.h - 3} V${car.y + 4} Q${car.x} ${car.y + 1} ${car.x + 2} ${car.y} Z`} />
              <path className="bp-plan" d={`M${car.x + 1.4} ${car.y + 7} Q${cx} ${car.y + 5.6} ${car.x + car.w - 1.4} ${car.y + 7} M${car.x + 1.4} ${car.y + car.h - 6} Q${cx} ${car.y + car.h - 4.8} ${car.x + car.w - 1.4} ${car.y + car.h - 6}`} />
              {TIRES.map((t) => {
                const [x, y, left] = corner[t];
                const r = tire[t] as TireReading | undefined;
                return (
                  <g key={t} className={`bp-tire ${r?.soft ? 'is-soft' : ''}`}>
                    <rect className="bp-tread" x={left ? x - 1.2 : x} y={y - 2.6} width="1.2" height="5.2" rx="0.4" />
                    <line className="bp-lead" x1={left ? x - 1.6 : x + 1.6} y1={y} x2={left ? x - 8 : x + 8} y2={y} />
                    <text className="bp-tiny" x={left ? x - 9 : x + 9} y={y - 2.2} textAnchor={left ? 'end' : 'start'}>
                      {t.toUpperCase()}
                    </text>
                    <text className="bp-cell-s" x={left ? x - 9 : x + 9} y={y + 2.4} textAnchor={left ? 'end' : 'start'}>
                      {r?.value ?? BLANK}
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}
      </Hit>

      {sheet.note && (
        <text className="bp-small is-soft" x={W / 2} y={panels.y - 2.4} textAnchor="middle">
          {sheet.note}
        </text>
      )}
    </svg>
      {pick && (
        <div className="bp-part" style={boxStyle({ x: 12, y: 36, w: 82, h: 10 + rowStep * 5 + 1 }, H)}>
          <PartPanel sheet={sheet} pick={pick} onClose={() => setPick(null)} onDetail={open} />
        </div>
      )}
    </div>
  );
}

/** The order the car turns through its views. */
const TURN: CarView[] = ['front', 'front34', 'side', 'rear34', 'rear', 'top'];

/**
 * Where each part sits on a view, as fractions of the car's own outline:
 * along it from the front (0) to the back (1), and up from the ground (0) to
 * the roof (1); on the top view, across it. From Tesla's figures for a
 * Model 3, close enough on any car to tap.
 */
const REGIONS: Partial<Record<CarView, [Pick, number, number, number, number][]>> = {
  side: [
    ['doors', 0.29, 0.72, 0.1, 0.65],
    ['glass', 0.27, 0.84, 0.67, 0.97],
    ['frunk', 0.04, 0.24, 0.44, 0.68],
    // The decklid, above the taillamp, where the charge port sits.
    ['trunk', 0.86, 0.99, 0.7, 0.82],
  ],
  front: [
    ['frunk', 0.26, 0.74, 0.42, 0.62],
    ['glass', 0.26, 0.74, 0.65, 0.95],
  ],
  rear: [
    ['trunk', 0.26, 0.74, 0.45, 0.68],
    ['glass', 0.26, 0.74, 0.71, 0.95],
  ],
  top: [
    ['frunk', 0.03, 0.24, 0.2, 0.8],
    ['glass', 0.26, 0.86, 0.2, 0.8],
    ['trunk', 0.87, 0.98, 0.2, 0.8],
  ],
};

/** A part's name on the drawing itself, where the space is small. */
const REGION_WORDS: Partial<Record<Pick, string>> = { doors: msg('Doors'), glass: msg('Cabin') };

/** A name cut to fit its place on the sheet. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const PICK_WORDS: Record<Pick, string> = {
  doors: msg('Doors and locks'),
  frunk: msg('Frunk'),
  trunk: msg('Trunk'),
  port: msg('Charge port'),
  glass: msg('Cabin and climate'),
  body: msg('Status'),
  tires: msg('Tires'),
};
const PICK_DETAIL: Partial<Record<Pick, Detail>> = { doors: 'status', body: 'status', port: 'charge', glass: 'climate', tires: 'tires' };

/**
 * One part of the car, in the place of the live metrics: its state, and what
 * it can be asked to do. Each command is held to confirm, as the server's are.
 */
function PartPanel({ sheet, pick, onClose, onDetail }: { sheet: CarSheet; pick: Pick; onClose: () => void; onDetail: (d: Detail) => void }) {
  const [busy, setBusy] = useState<CarCommand | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [limit, setLimit] = useState(sheet.limit);
  // Without sign-in, nothing that lets someone into the car is offered.
  const signIn = useJson<{ auth?: string }>('/api/session').data?.auth;
  const guarded = signIn === 'none';
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), [pick]);
  useEffect(() => setSaid(null), [pick]);
  const send = async (cmd: CarCommand, percent?: number) => {
    setBusy(cmd);
    setSaid(null);
    try {
      const res = await fetch(`/api/car/${encodeURIComponent(sheet.vin)}/command/${cmd}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-patchboard': 'action' },
        body: JSON.stringify(percent != null ? { percent } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSaid({ ok: true, text: tr('Done') });
    } catch (err) {
      setSaid({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const open = (k: 'frunk' | 'trunk') => !!sheet.parts[k];
  const rows: [string, string, boolean?][] =
    pick === 'doors'
      ? [
          [tr('Doors'), sheet.locked ? tr('Locked') : tr('Unlocked'), !sheet.locked],
          [tr('Open'), sheet.open.length ? sheet.open.join(', ') : tr('Nothing'), sheet.open.length > 0],
        ]
      : pick === 'frunk' || pick === 'trunk'
        ? [[tr(PICK_WORDS[pick]), open(pick) ? tr('Open') : tr('Closed'), open(pick)]]
        : pick === 'port'
          ? [
              [tr('State'), tr(sheet.state)],
              [tr('Rate'), sheet.charging && sheet.kw ? sheet.kw : BLANK],
              [tr('Charge'), `${sheet.battery}%`],
              // The limit's own stepper shows it when it can be changed here.
              ...(sheet.noControls ? ([[tr('Limit'), `${sheet.limit}%`]] as [string, string][]) : []),
            ]
          : pick === 'glass'
            ? [
                [tr('Cabin'), sheet.inside ?? BLANK],
                [tr('Outside'), sheet.outside ?? BLANK],
                [tr('Climate'), sheet.climate ? tr('On') : tr('Off')],
              ]
            : pick === 'tires'
              ? sheet.tires.length
                ? sheet.tires.map((t) => [t.name, `${t.value} ${sheet.unit}`, t.soft] as [string, string, boolean])
                : [[tr('Tire pressure'), tr('Not measured yet')]]
              : [
                  [tr('Sentry'), sheet.sentry ? tr('On') : tr('Off')],
                  [tr('Odometer'), sheet.odometer],
                  ...(sheet.parked ? ([[tr('Parked'), sheet.parked]] as [string, string][]) : []),
                ];
  // What this part can be asked to do: [command, the word on the button, the hint for a short tap].
  const acts: [CarCommand, string, string][] = sheet.noControls
    ? []
    : pick === 'doors'
      ? [sheet.locked ? ['unlock', tr('Unlock'), tr('Hold to unlock')] : ['lock', tr('Lock'), tr('Hold to lock')], ['flash', tr('Flash the lights'), tr('Hold to flash')], ['honk', tr('Honk'), tr('Hold to honk')]]
      : pick === 'frunk'
        ? open('frunk')
          ? []
          : [['frunk', tr('Open the frunk'), tr('Hold to open')]]
        : pick === 'trunk'
          ? [['trunk', open('trunk') ? tr('Close the trunk') : tr('Open the trunk'), open('trunk') ? tr('Hold to close') : tr('Hold to open')]]
          : pick === 'port'
            ? [
                ...(sheet.charging
                  ? ([['charge-stop', tr('Stop charging'), tr('Hold to stop')]] as [CarCommand, string, string][])
                  : sheet.plugged
                    ? ([['charge-start', tr('Start charging'), tr('Hold to start')]] as [CarCommand, string, string][])
                    : []),
                sheet.portOpen ? ['port-close', tr('Close the port'), tr('Hold to close')] : ['port-open', tr('Open the port'), tr('Hold to open')],
              ]
            : pick === 'glass'
              ? [sheet.climate ? ['climate-off', tr('Turn climate off'), tr('Hold to turn off')] : ['climate-on', tr('Turn climate on'), tr('Hold to turn on')]]
              : pick === 'body'
                ? [sheet.sentry ? ['sentry-off', tr('Turn Sentry off'), tr('Hold to turn off')] : ['sentry-on', tr('Turn Sentry on'), tr('Hold to turn on')]]
                : [];
  const held = guarded ? acts.filter(([cmd]) => OPENS_CAR.includes(cmd)) : [];
  const offered = acts.filter((a) => !held.includes(a));
  const detail = PICK_DETAIL[pick];
  return (
    <section className="bp-part-in" aria-label={tr(PICK_WORDS[pick])}>
      <header className="bp-part-head">
        <span>{tr(PICK_WORDS[pick])}</span>
        <button ref={close} type="button" className="bp-part-x" onClick={onClose} aria-label={tr('Close')}>
          ×
        </button>
      </header>
      <dl className="bp-part-rows">
        {rows.map(([k, v, trouble]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={trouble ? 'is-soft' : ''}>{v}</dd>
          </div>
        ))}
      </dl>
      {pick === 'port' && !sheet.noControls && (
        <div className="bp-part-limit">
          <span>{tr('Limit')}</span>
          <button type="button" className="bp-part-step" aria-label={tr('Lower the limit')} onClick={() => setLimit((l) => Math.max(50, l - 5))}>
            −
          </button>
          <output aria-live="polite">{limit}%</output>
          <button type="button" className="bp-part-step" aria-label={tr('Raise the limit')} onClick={() => setLimit((l) => Math.min(100, l + 5))}>
            +
          </button>
          {limit !== sheet.limit && (
            <HoldButton className="bp-part-act" hint={tr('Hold to set')} disabled={!!busy} onConfirm={() => void send('limit', limit)}>
              {tr('Set')}
            </HoldButton>
          )}
        </div>
      )}
      {held.length > 0 && <p className="bp-part-said">{tr('Turn on sign-in to unlock or open the car from here.')}</p>}
      {offered.length > 0 && (
        <div className="bp-part-acts">
          {offered.map(([cmd, word, hint]) => (
            <HoldButton key={cmd} className="bp-part-act" hint={hint} disabled={!!busy} onConfirm={() => void send(cmd)}>
              {busy === cmd ? tr('Sending...') : word}
            </HoldButton>
          ))}
        </div>
      )}
      {said && (
        <p className={`bp-part-said ${said.ok ? '' : 'is-soft'}`} role="status">
          {said.text}
        </p>
      )}
      {detail && (
        <button type="button" className="bp-part-more" onClick={() => onDetail(detail)}>
          {pick === 'tires' ? tr('Pressure history') : tr('More')}
        </button>
      )}
    </section>
  );
}

/** A box on the sheet, placed over it in the sheet's own units. */
/** The sheet itself: a faint grid, the outer border, and the zone border numbered 1 to 8 and lettered A to F. */
export function Frame({ id, H }: { id: string; H: number }) {
  const cols = 8;
  const rows = 6;
  const zone = { x: 8, y: 8, w: W - 16, h: H - 16 };
  const cellW = zone.w / cols;
  const cellH = zone.h / rows;
  return (
    <>
      <defs>
        <pattern id={`${id}-hatch`} width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.4" className="bp-hatch" />
        </pattern>
        <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M5 0 V20 M10 0 V20 M15 0 V20 M0 5 H20 M0 10 H20 M0 15 H20" className="bp-grid-minor" />
          <path d="M0 0 H20 M0 0 V20" className="bp-grid-major" />
        </pattern>
      </defs>
      <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill={`url(#${id}-grid)`} />
      <rect className="bp-frame" x="2" y="2" width={W - 4} height={H - 4} />
      <rect className="bp-frame" x={zone.x} y={zone.y} width={zone.w} height={zone.h} />
      {Array.from({ length: cols }, (_, i) => (
        <g key={`c${i}`} className="bp-zone">
          {i > 0 && <path d={`M${zone.x + cellW * i} 2 V${zone.y} M${zone.x + cellW * i} ${H - 2} V${H - zone.y}`} />}
          <text x={zone.x + cellW * (i + 0.5)} y="6.6" textAnchor="middle">
            {i + 1}
          </text>
          <text x={zone.x + cellW * (i + 0.5)} y={H - 3.4} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <g key={`r${i}`} className="bp-zone">
          {i > 0 && <path d={`M2 ${zone.y + cellH * i} H${zone.x} M${W - 2} ${zone.y + cellH * i} H${W - zone.x}`} />}
          <text x="5" y={zone.y + cellH * (i + 0.5) + 1} textAnchor="middle">
            {'ABCDEF'[i]}
          </text>
          <text x={W - 5} y={zone.y + cellH * (i + 0.5) + 1} textAnchor="middle">
            {'ABCDEF'[i]}
          </text>
        </g>
      ))}
    </>
  );
}

function boxStyle(b: { x: number; y: number; w: number; h: number }, H: number): CSSProperties {
  return { left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` };
}

/** A round step for an axis: 1, 2, 2.5 or 5 times a power of ten, near a quarter of the span. */
function niceStep(span: number) {
  const raw = span / 4 || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

/** Labels kept apart: each at least `gap` from the one before, in order down the sheet. */
function spread<T extends { y: number }>(items: T[], gap: number, lo: number, hi: number): T[] {
  const out = [...items].sort((a, b) => a.y - b.y).map((it) => ({ ...it }));
  for (let i = 0; i < out.length; i++) out[i].y = Math.max(out[i].y, i ? out[i - 1].y + gap : lo);
  for (let i = out.length - 1; i >= 0; i--) out[i].y = Math.min(out[i].y, i < out.length - 1 ? out[i + 1].y - gap : hi);
  return out;
}

interface Trace {
  data: Series | undefined;
  label: string;
  soft?: boolean;
}

/**
 * A history plotted the way a drawing would: ruled axes, round ticks, days or
 * hours along the bottom, each line named at its end. Point along it, drag a
 * finger across it, or use the arrow keys, to read every line at one moment.
 */
function Plot({
  box,
  title,
  traces,
  format,
  unit,
  lo,
  hi,
  limit,
  day,
}: {
  box: Box;
  title: string;
  traces: Trace[];
  format: (v: number) => string;
  /** The unit, over the scale. */
  unit?: string;
  lo?: number;
  hi?: number;
  /** A level marked across it, as the charge limit. */
  limit?: { v: number; label: string };
  /** Hours along the bottom, for a day; otherwise days, for a week. */
  day?: boolean;
}) {
  const svg = useRef<SVGGElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const lines = traces.filter((t) => t.data && t.data.length > 1);
  const all = lines.flatMap((l) => l.data!);
  const g = { x: box.x + 15, y: box.y + 13, w: box.w - 15 - 24, h: box.h - 13 - 7 };
  const head = (
    <>
      <text className="bp-row" x={box.x} y={box.y + 4}>
        {title}
      </text>
      <line className="bp-rule" x1={box.x} y1={box.y + 6} x2={box.x + box.w} y2={box.y + 6} />
    </>
  );
  if (all.length < 2) {
    return (
      <g>
        {head}
        <rect className="bp-box bp-empty" x={g.x} y={g.y} width={g.w} height={g.h} />
        <text className="bp-small" x={g.x + g.w / 2} y={g.y + g.h / 2 + 1} textAnchor="middle">
          {tr('Not enough history yet')}
        </text>
      </g>
    );
  }
  const t0 = Math.min(...all.map((p) => p[0]));
  const t1 = Math.max(...all.map((p) => p[0]));
  let vLo = lo ?? Math.min(...all.map((p) => p[1]), limit?.v ?? Infinity);
  let vHi = hi ?? Math.max(...all.map((p) => p[1]), limit?.v ?? -Infinity);
  if (lo == null || hi == null) {
    const pad = (vHi - vLo) * 0.15 || Math.abs(vHi) * 0.05 || 1;
    if (lo == null) vLo -= pad;
    if (hi == null) vHi += pad;
  }
  const step = niceStep(vHi - vLo);
  if (lo == null) vLo = Math.floor(vLo / step) * step;
  if (hi == null) vHi = Math.ceil(vHi / step) * step;
  const xOf = (t: number) => g.x + ((t - t0) / (t1 - t0 || 1)) * g.w;
  const yOf = (v: number) => g.y + g.h - ((Math.min(vHi, Math.max(vLo, v)) - vLo) / (vHi - vLo || 1)) * g.h;
  const ticks: number[] = [];
  for (let i = Math.ceil(vLo / step - 1e-9); i * step <= vHi + 1e-9; i++) ticks.push(i * step || 0);
  // Along the bottom: each midnight for a week, every six hours for a day.
  const marks: number[] = [];
  const d = new Date(t0);
  d.setMinutes(0, 0, 0);
  const every = day ? 6 : 24;
  d.setHours(Math.ceil(d.getHours() / every) * every);
  for (; d.getTime() <= t1; d.setHours(d.getHours() + every)) marks.push(d.getTime());
  const loc = locale();
  const dayName = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  const hour = new Intl.DateTimeFormat(loc, { hour: 'numeric' });
  const when = new Intl.DateTimeFormat(loc, day ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const times = [...new Set(all.map((p) => p[0]))].sort((a, b) => a - b);
  const nearest = (s: Series, t: number) => s.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), s[0]);
  const path = (s: Series) => s.map(([t, v], i) => `${i ? 'L' : 'M'}${xOf(t).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' ');
  const ends = spread(
    lines.map((l) => ({ l, y: yOf(l.data![l.data!.length - 1][1]) + 1 })),
    3.4,
    g.y + 1,
    g.y + g.h + 1,
  );
  const point = (clientX: number) => {
    const m = svg.current?.ownerSVGElement?.getScreenCTM();
    if (!m) return;
    const x = (clientX - m.e) / m.a;
    const t = t0 + ((x - g.x) / g.w) * (t1 - t0);
    setAt(nearest(times.map((x) => [x, 0]), t)[0]);
  };
  const tAt = at ?? null;
  const reads = tAt == null ? [] : lines.map((l) => ({ l, p: nearest(l.data!, tAt) }));
  const cx = tAt == null ? 0 : xOf(tAt);
  const flip = cx > g.x + g.w * 0.72;
  const latest = lines.map((l) => `${l.label} ${format(l.data![l.data!.length - 1][1])}`).join(', ');
  return (
    <g
      ref={svg}
      className="bp-plot"
      role="group"
      tabIndex={0}
      aria-label={`${title}. ${tr('Now')}: ${latest}`}
      onPointerMove={(e) => point(e.clientX)}
      onPointerDown={(e) => point(e.clientX)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}
      onFocus={() => at == null && setAt(times[times.length - 1])}
      onBlur={() => setAt(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = at == null ? times.length - 1 : times.indexOf(at);
        setAt(times[Math.max(0, Math.min(times.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]);
      }}
    >
      {head}
      {unit && (
        <text className="bp-tiny" x={g.x - 1.4} y={g.y - 3.6} textAnchor="end">
          {unit}
        </text>
      )}
      {ticks.map((v) => (
        <g key={v}>
          <line className="bp-rule-soft" x1={g.x} y1={yOf(v)} x2={g.x + g.w} y2={yOf(v)} />
          <text className="bp-tiny" x={g.x - 1.4} y={yOf(v) + 0.9} textAnchor="end">
            {format(v)}
          </text>
        </g>
      ))}
      {marks.map((t) => (
        <g key={t}>
          <line className="bp-rule-soft" x1={xOf(t)} y1={g.y} x2={xOf(t)} y2={g.y + g.h + 1.2} />
          {/* A week names each day across its middle; a day marks the hour at its line. */}
          {day ? (
            <text className="bp-tiny" x={xOf(t)} y={g.y + g.h + 4} textAnchor="middle">
              {hour.format(t)}
            </text>
          ) : (
            xOf(t + 43_200_000) < g.x + g.w && (
              <text className="bp-tiny" x={xOf(t + 43_200_000)} y={g.y + g.h + 4} textAnchor="middle">
                {dayName.format(t)}
              </text>
            )
          )}
        </g>
      ))}
      <path className="bp-axis" d={`M${g.x} ${g.y} V${g.y + g.h} H${g.x + g.w}`} />
      {limit && (
        <>
          <line className="bp-limit" x1={g.x} y1={yOf(limit.v)} x2={g.x + g.w} y2={yOf(limit.v)} />
          <text className="bp-tiny" x={g.x + 1.2} y={yOf(limit.v) - 1} >
            {limit.label}
          </text>
        </>
      )}
      {lines.map((l) => (
        <path key={l.label} className={`bp-trace ${l.soft ? 'is-soft' : ''}`} d={path(l.data!)} />
      ))}
      {ends.map(({ l, y }) => (
        <text key={l.label} className={`bp-tiny ${l.soft ? 'is-soft' : ''}`} x={g.x + g.w + 1.6} y={y}>
          {l.label}
        </text>
      ))}
      {tAt != null && (
        <g className="bp-cursor">
          <line x1={cx} y1={g.y - 2} x2={cx} y2={g.y + g.h} />
          {reads.map(({ l, p }) => (
            <circle key={l.label} className={`bp-dot ${l.soft ? 'is-soft' : ''}`} cx={xOf(p[0])} cy={yOf(p[1])} r="0.9" />
          ))}
          {spread(
            reads.map(({ l, p }) => ({ l, p, y: yOf(p[1]) + 1 })),
            3.2,
            g.y + 4,
            g.y + g.h - 1,
          ).map(({ l, p, y }) => (
            <text key={l.label} className={`bp-cell-s ${l.soft ? 'is-soft' : ''}`} x={cx + (flip ? -1.8 : 1.8)} y={y} textAnchor={flip ? 'end' : 'start'}>
              {lines.length > 1 ? `${l.label} ${format(p[1])}` : format(p[1])}
            </text>
          ))}
          <text className="bp-tiny bp-cursor-when" x={cx} y={g.y - 2.8} textAnchor="middle">
            {when.format(tAt)}
          </text>
        </g>
      )}
      {/* The whole plot answers a finger or a pointer, not only its lines. */}
      <rect className="bp-hit-area bp-plot-pad" x={g.x} y={g.y} width={g.w} height={g.h} />
    </g>
  );
}

/** The car from above, nose to the left as the side view faces, in `car`: body, glass, mirrors and a center line. */
function Plan({ car }: { car: Box }) {
  const { x, y, w, h } = car;
  const r = h * 0.3;
  const ws = x + w * 0.31;
  const rw = x + w * 0.78;
  return (
    <g>
      <path className="bp-center" d={`M${x - 5} ${y + h / 2} H${x + w + 5}`} />
      <path
        className="bp-plan"
        d={`M${x + r} ${y} H${x + w - r * 0.6} Q${x + w} ${y} ${x + w} ${y + r * 0.6} V${y + h - r * 0.6} Q${x + w} ${y + h} ${x + w - r * 0.6} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`}
      />
      <path
        className="bp-plan"
        d={`M${ws} ${y + h * 0.12} Q${ws - w * 0.06} ${y + h / 2} ${ws} ${y + h * 0.88} M${rw} ${y + h * 0.15} Q${rw + w * 0.035} ${y + h / 2} ${rw} ${y + h * 0.85} M${ws + 1.5} ${y + h * 0.16} H${rw - 1.5} M${ws + 1.5} ${y + h * 0.84} H${rw - 1.5}`}
      />
      <path className="bp-plan" d={`M${x + w * 0.3} ${y} l-1.2 -2.2 h3.4 l0.6 2.2 M${x + w * 0.3} ${y + h} l-1.2 2.2 h3.4 l0.6 -2.2`} />
    </g>
  );
}

/** Where the wheels sit along a plan: the front axle and the rear, as fractions of its length. */
const AXLES = { front: 0.19, rear: 0.8 };

/** A part of the car opened up, as a sheet of its own: its figures, a drawing of it, and what Patchboard has recorded. */
function DetailSheet({ sheet, pics, detail, onBack, tall }: { sheet: CarSheet; pics: CarPicture[]; detail: Detail; onBack: () => void; tall: boolean }) {
  const H = tall ? TALL : WIDE;
  // The car from above: your top-view drawing where you've added one, a drawn plan otherwise. Either
  // way, nose to the left, and the outline of the car itself for the tires and doors to sit on.
  const topPic = pics.find((p) => p.view === 'top') ?? null;
  const topFramed = framedOf(topPic);
  const softTires = Object.fromEntries(sheet.tires.map((t) => [t.pos, t.soft])) as Record<TirePos, boolean>;
  const above = (slot: Box): { car: Box; drawing: ReactNode; drawn: boolean } => {
    if (topPic && topFramed) {
      const p = place(topFramed, slot);
      return { car: { x: p.ink.x0, y: p.ink.y0, w: p.ink.x1 - p.ink.x0, h: p.ink.y1 - p.ink.y0 }, drawing: <ViewImage pic={topPic} framed={topFramed} box={p.box} soft={softTires} />, drawn: false };
    }
    const ch = Math.min(slot.h, slot.w / 2.5);
    const car = { x: slot.x + (slot.w - ch * 2.5) / 2, y: slot.y + (slot.h - ch) / 2, w: ch * 2.5, h: ch };
    return { car, drawing: <Plan car={car} />, drawn: true };
  };
  const [letter, title] = DETAIL[detail];
  const id = useId().replace(/:/g, '');
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => stage.current?.querySelector<SVGGElement>('.bp-back')?.focus(), []);
  // A poster on a TV, driven by its remote: up and down move between Back and the history, left and
  // right read along the history from the latest reading. The remote's own Back button closes it.
  useEffect(() => {
    if (!stage.current?.closest('.widget-page')) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const plot = stage.current?.querySelector<SVGGElement>('.bp-plot');
      const back = stage.current?.querySelector<SVGGElement>('.bp-back');
      if (!plot || !back) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') (document.activeElement === plot ? back : plot).focus();
      else plot.focus();
    };
    // Ahead of a wall screen's page turning, which would otherwise take left and right first.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  const rows: [string, string, boolean?][] =
    detail === 'tires'
      ? sheet.tires.length
        ? sheet.tires.map((t) => [t.name, `${t.value} ${sheet.unit}`, t.soft])
        : [[tr('Tire pressure'), tr('Not measured yet')]]
      : detail === 'charge'
        ? [
            [tr('Charge'), `${sheet.battery}%${sheet.usable != null && sheet.usable !== sheet.battery ? `, ${tr('{n}% usable', { n: sheet.usable })}` : ''}`, sheet.low],
            [tr('State'), tr(sheet.state)],
            [tr('Rate'), sheet.charging && sheet.kw ? sheet.kw : BLANK],
            [tr('Voltage and current'), sheet.volts && sheet.amps ? `${sheet.volts} V, ${sheet.amps} A` : BLANK],
            [tr('Added this session'), sheet.added ?? BLANK],
            [tr('Full in'), sheet.toFull ?? BLANK],
            [tr('Limit'), `${sheet.limit}%`],
          ]
        : detail === 'range'
          ? [
              [tr('Range now'), sheet.range],
              [tr('At the limit'), sheet.battery > 0 ? sheet.dist((sheet.rangeMi / sheet.battery) * sheet.limit) : BLANK],
              [tr('Full'), sheet.battery > 0 ? sheet.dist((sheet.rangeMi / sheet.battery) * 100) : BLANK],
              ...(sheet.lastDrive ? ([[tr('Last drive'), sheet.lastDrive]] as [string, string][]) : []),
              ...(sheet.weekDriven ? ([[tr('Driven, last 7 days'), sheet.weekDriven]] as [string, string][]) : []),
              ...(sheet.efficiency ? ([[tr('Efficiency, last 7 days'), sheet.efficiency]] as [string, string][]) : []),
            ]
          : detail === 'climate'
            ? [
                [tr('Cabin'), sheet.inside ?? BLANK],
                [tr('Outside'), sheet.outside ?? BLANK],
                [tr('Climate'), sheet.climate ? tr('On') : tr('Off')],
              ]
            : [
                [tr('Doors'), sheet.locked ? tr('Locked') : tr('Unlocked'), !sheet.locked],
                [tr('Open'), sheet.open.length ? sheet.open.join(', ') : tr('Nothing'), sheet.open.length > 0],
                [tr('Sentry'), sheet.sentry ? tr('On') : tr('Off')],
                ...(sheet.parked ? ([[tr('Parked'), sheet.parked]] as [string, string][]) : []),
                [tr('Odometer'), sheet.odometer],
                [sheet.asleep ? tr('Asleep, read') : tr('Read'), sheet.read],
              ];
  // The figures down the left, as the live metrics sit on the main sheet: as roomy as the sheet allows.
  const step = Math.min(tall ? 22 : 15.4, (H - 14 - 36 - 11) / rows.length);
  const pad = Math.max(0, (step - 15.4) / 2);
  // The drawing on the right: a view of the part above, its history below. Status is all view; it has no history.
  const right = { x: 104, y: 16, w: 204, h: H - 30 };
  const split = detail === 'status' ? right.h : tall ? 100 : 66;
  const view: Box = { ...right, h: split };
  const plotBox: Box = { x: right.x, y: right.y + split + 8, w: right.w, h: right.h - split - 8 };
  const perPct = sheet.battery > 0 ? sheet.rangeMi / sheet.battery : 0;
  const tire = Object.fromEntries(sheet.tires.map((t) => [t.pos, t])) as Partial<Record<TirePos, TireReading>>;

  return (
    <div ref={stage} className="bp-stage" style={{ '--ratio': W / H } as CSSProperties}>
      <svg className="bp-sheet bp-detail-sheet" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${tr('Detail {letter}', { letter })}: ${tr(title)}`}>
        <Frame id={id} H={H} />

        {/* Title, as on the main sheet: the detail's letter large, what it is and whose car under it. */}
        <text className="bp-title" x="13" y="22">
          {tr('Detail {letter}', { letter })}
        </text>
        <text className="bp-small" x="13.4" y="28">
          <title>{`${tr(title)} · ${sheet.name}`}</title>
          {clip(`${tr(title)} · ${sheet.name}`, 34)}
        </text>
        <line className="bp-rule" x1="13" y1="31" x2="92" y2="31" />

        {/* The figures: each name small above its value. */}
        <rect className="bp-box" x="12" y="36" width="82" height={10 + step * rows.length + 1} />
        <text className="bp-row" x="16" y="42.5">
          {tr('Figures')}
        </text>
        <line className="bp-rule" x1="12" y1="45" x2="94" y2="45" />
        {rows.map(([k, v, trouble], i) => {
          const y = 47 + i * step + pad;
          const long = v.length > 15;
          return (
            <g key={k}>
              <text className="bp-tiny" x="15" y={y + 4}>
                {clip(k, 30)}
              </text>
              <text className={`${long ? 'bp-cell' : 'bp-metric'} ${trouble ? 'is-soft' : ''}`} x="15" y={y + (long ? 10.4 : 11.6)}>
                {v.length > 26 && <title>{v}</title>}
                {clip(v, 26)}
              </text>
              {i < rows.length - 1 && <line className="bp-rule-soft" x1="15" y1={y - pad + step - 0.2} x2="91" y2={y - pad + step - 0.2} />}
            </g>
          );
        })}

        {/* Back to the whole car, top right, where a drawing keeps its number. Escape does the same. */}
        <Hit label={tr('Back')} onOpen={onBack} className="bp-back">
          <rect className="bp-box bp-hit-area" x="270" y="12" width="38" height="11" />
          <path className="bp-turn-mark" d="M276.4 15.2 l-2.4 2.3 l2.4 2.3" />
          <text className="bp-row" x="291" y="19" textAnchor="middle">
            {tr('Back')}
          </text>
        </Hit>

        {detail === 'tires' &&
          (() => {
            const { car, drawing, drawn } = above({ x: view.x + 52, y: view.y + view.h * 0.22 + 2, w: view.w - 104, h: view.h * 0.54 });
            // A drawing's outline takes in the mirrors: the tires sit a little inside it.
            const edge = drawn ? 0 : car.h * 0.09;
            // Seen from above, nose to the left: the left side of the car is the bottom of the drawing.
            const at: Record<TirePos, [number, number]> = {
              fl: [car.x + car.w * AXLES.front, car.y + car.h - edge],
              fr: [car.x + car.w * AXLES.front, car.y + edge],
              rl: [car.x + car.w * AXLES.rear, car.y + car.h - edge],
              rr: [car.x + car.w * AXLES.rear, car.y + edge],
            };
            const tw = car.w * 0.13;
            const th = car.h * 0.16;
            return (
              <g>
                {drawing}
                {TIRES.map((t) => {
                  const [tx, ty] = at[t];
                  const r = tire[t];
                  const front = t[0] === 'f';
                  const top = t[1] === 'r';
                  const lx = front ? car.x - 9 : car.x + car.w + 9;
                  const ly = top ? car.y + 1 : car.y + car.h + 1;
                  return (
                    <g key={t} className={`bp-tire ${r?.soft ? 'is-soft' : ''}`}>
                      {/* On the plan, the tire itself; on your drawing, which already draws it, a mark around it. */}
                      <rect className={drawn ? 'bp-tread' : 'bp-tire-mark'} x={tx - tw / 2} y={top ? ty - th * 0.35 : ty - th * 0.65} width={tw} height={th} rx="0.6" />
                      <path className="bp-lead" d={`M${tx} ${top ? ty - th * 0.35 : ty + th * 0.35} L${front ? lx + 7 : lx - 7} ${ly - 2} H${lx + (front ? 1 : -1)}`} />
                      <text className="bp-tiny" x={lx} y={ly - 6.4} textAnchor={front ? 'end' : 'start'}>
                        {r?.name ?? t.toUpperCase()}
                      </text>
                      <text className={`bp-metric ${r?.soft ? 'is-soft' : ''}`} x={lx} y={ly} textAnchor={front ? 'end' : 'start'}>
                        {r?.value ?? BLANK}
                        <tspan className="bp-tiny" dx="1">
                          {r ? sheet.unit : ''}
                        </tspan>
                      </text>
                    </g>
                  );
                })}
                {sheet.note && (
                  <text className="bp-small is-soft" x={view.x + view.w / 2} y={view.y + view.h - 1} textAnchor="middle">
                    {sheet.note}
                  </text>
                )}
              </g>
            );
          })()}

        {detail === 'status' &&
          (() => {
            const { car, drawing } = above({ x: view.x + 50, y: view.y + view.h * 0.33, w: view.w - 100, h: view.h * 0.34 });
            const { x, y, w, h } = car;
            const band = h * 0.16;
            // Each opening on the plan, where it is, and which way its label goes.
            const parts: [keyof CarSheet['parts'], string, Box, 'up' | 'down' | 'left' | 'right'][] = [
              ['frunk', msg('Frunk'), { x: x + w * 0.04, y: y + h * 0.2, w: w * 0.2, h: h * 0.6 }, 'left'],
              ['trunk', msg('Trunk'), { x: x + w * 0.83, y: y + h * 0.2, w: w * 0.14, h: h * 0.6 }, 'right'],
              ['fr', msg('Front right'), { x: x + w * 0.31, y, w: w * 0.22, h: band }, 'up'],
              ['rr', msg('Rear right'), { x: x + w * 0.53, y, w: w * 0.22, h: band }, 'up'],
              ['fl', msg('Front left'), { x: x + w * 0.31, y: y + h - band, w: w * 0.22, h: band }, 'down'],
              ['rl', msg('Rear left'), { x: x + w * 0.53, y: y + h - band, w: w * 0.22, h: band }, 'down'],
            ];
            return (
              <g>
                {drawing}
                {parts.map(([k, word, b, dir]) => {
                  const opened = !!sheet.parts[k];
                  const mx = b.x + b.w / 2;
                  const my = b.y + b.h / 2;
                  const end: [number, number] =
                    dir === 'up' ? [mx, y - 12] : dir === 'down' ? [mx, y + h + 12] : dir === 'left' ? [x - 12, my] : [x + w + 12, my];
                  const anchor = dir === 'left' ? 'end' : dir === 'right' ? 'start' : 'middle';
                  const tx = dir === 'left' ? end[0] - 1.5 : dir === 'right' ? end[0] + 1.5 : end[0];
                  const ty = dir === 'up' ? end[1] - 5 : dir === 'down' ? end[1] + 4 : end[1] - 1.6;
                  return (
                    <g key={k} className={`bp-region ${opened ? 'is-open' : ''}`}>
                      <rect className="bp-region-box is-shown" x={b.x} y={b.y} width={b.w} height={b.h} rx="1" fill={opened ? `url(#${id}-hatch)` : undefined} />
                      <path className="bp-lead" d={`M${mx} ${my} L${end[0]} ${end[1]}`} />
                      <circle className="bp-dot" cx={mx} cy={my} r="0.6" />
                      <text className="bp-tiny" x={tx} y={ty} textAnchor={anchor}>
                        {tr(word)}
                      </text>
                      <text className={`bp-cell-s ${opened ? 'is-soft' : ''}`} x={tx} y={ty + 4.2} textAnchor={anchor}>
                        {opened ? tr('Open') : tr('Closed')}
                      </text>
                    </g>
                  );
                })}
                <text className={`bp-row ${sheet.locked ? '' : 'is-soft'}`} x={x + w * 0.545} y={y + h / 2 - 0.6} textAnchor="middle">
                  {sheet.locked ? tr('Locked') : tr('Unlocked')}
                </text>
                <text className="bp-tiny" x={x + w * 0.545} y={y + h / 2 + 3.6} textAnchor="middle">
                  {tr('Sentry')} {sheet.sentry ? tr('On') : tr('Off')}
                </text>
              </g>
            );
          })()}

        {detail === 'charge' &&
          (() => {
            const pw = view.w - 64;
            const ph = Math.min(tall ? 34 : 22, view.h * 0.36);
            const p = { x: view.x + 22, y: view.y + (view.h - ph) / 2 + 3, w: pw, h: ph };
            const fill = (p.w * Math.max(0, Math.min(100, sheet.battery))) / 100;
            const lim = p.x + (p.w * sheet.limit) / 100;
            return (
              <g>
                <text className="bp-small" x={p.x} y={p.y - 8}>
                  {tr(sheet.state)}
                  {sheet.charging && sheet.kw ? ` · ${sheet.kw}` : ''}
                  {sheet.toFull ? ` · ${tr('Full in')} ${sheet.toFull}` : ''}
                </text>
                {/* The pack: ten cells, hatched as far as it's charged, the terminal on the right. */}
                <rect className={`bp-pack-fill ${sheet.low ? 'is-soft' : ''}`} x={p.x} y={p.y} width={fill} height={p.h} fill={`url(#${id}-hatch)`} />
                <rect className="bp-plan" x={p.x} y={p.y} width={p.w} height={p.h} rx="1" />
                {Array.from({ length: 9 }, (_, i) => (
                  <line key={i} className="bp-rule-soft" x1={p.x + (p.w * (i + 1)) / 10} y1={p.y} x2={p.x + (p.w * (i + 1)) / 10} y2={p.y + p.h} />
                ))}
                <rect className="bp-plan" x={p.x + p.w} y={p.y + p.h * 0.3} width="2.6" height={p.h * 0.4} rx="0.5" />
                {sheet.charging && <path className="bp-cable-flow" d={`M${p.x + p.w + 30} ${p.y + p.h / 2} H${p.x + p.w + 2.6}`} />}
                {sheet.plugged && (
                  <>
                    <path className="bp-lead" d={`M${p.x + p.w + 2.6} ${p.y + p.h / 2} H${p.x + p.w + 30}`} />
                    <path className="bp-icon" d={ICONS.power} transform={`translate(${p.x + p.w + 31} ${p.y + p.h / 2 - 3})`} />
                  </>
                )}
                <line className="bp-limit" x1={lim} y1={p.y - 4} x2={lim} y2={p.y + p.h + 2} />
                <text className="bp-tiny" x={lim} y={p.y - 5} textAnchor="middle">
                  {tr('Limit')} {sheet.limit}%
                </text>
                {fill > 6 && <Dimension x0={p.x} y0={p.y + p.h + 6} x1={p.x + fill} y1={p.y + p.h + 6} text={`${sheet.battery}%`} />}
                <text className="bp-tiny" x={p.x + p.w} y={p.y + p.h + 7.5} textAnchor="end">
                  100%
                </text>
              </g>
            );
          })()}

        {detail === 'range' &&
          (() => {
            const g = { x: view.x + 16, y: view.y + 12, w: view.w - 92, h: view.h - 19 };
            const full = perPct * 100;
            const at = (pct: number): [number, number] => [g.x + (g.w * pct) / 100, g.y + g.h - (g.h * pct) / 100];
            const now = at(sheet.battery);
            const lim = at(sheet.limit);
            const top = at(100);
            const callouts = spread(
              [
                { k: 'full', y: top[1], from: top, text: `${tr('Full')} · ${sheet.dist(full)}` },
                { k: 'limit', y: lim[1], from: lim, text: `${tr('Limit')} ${sheet.limit}% · ${sheet.dist(perPct * sheet.limit)}` },
                { k: 'now', y: now[1], from: now, text: `${tr('Now')} ${sheet.battery}% · ${sheet.range}` },
              ],
              6,
              g.y + 2,
              g.y + g.h,
            );
            return (
              <g>
                <text className="bp-tiny" x={g.x - 1.4} y={g.y - 3.6} textAnchor="end">
                  {tr('Range')}
                </text>
                <path className="bp-axis" d={`M${g.x} ${g.y} V${g.y + g.h} H${g.x + g.w}`} />
                {[25, 50, 75].map((p) => (
                  <line key={p} className="bp-rule-soft" x1={at(p)[0]} y1={g.y} x2={at(p)[0]} y2={g.y + g.h} />
                ))}
                <line className="bp-trace" x1={g.x} y1={g.y + g.h} x2={top[0]} y2={top[1]} />
                <line className="bp-limit" x1={lim[0]} y1={g.y} x2={lim[0]} y2={g.y + g.h} />
                <path className="bp-limit" d={`M${g.x} ${now[1]} H${now[0]} V${g.y + g.h}`} />
                <circle className={`bp-dot ${sheet.low ? 'is-soft' : ''}`} cx={now[0]} cy={now[1]} r="1.1" />
                <circle className="bp-dot" cx={lim[0]} cy={lim[1]} r="0.8" />
                <circle className="bp-dot" cx={top[0]} cy={top[1]} r="0.8" />
                {callouts.map((c) => (
                  <g key={c.k}>
                    <path className="bp-lead" d={`M${c.from[0] + 1} ${c.from[1]} L${g.x + g.w + 4} ${c.y} H${g.x + g.w + 6}`} />
                    <text className={`${c.k === 'now' ? 'bp-cell-s' : 'bp-tiny'} ${c.k === 'now' && sheet.low ? 'is-soft' : ''}`} x={g.x + g.w + 7} y={c.y + 1}>
                      {c.text}
                    </text>
                  </g>
                ))}
                <text className="bp-tiny" x={g.x - 1.4} y={g.y + g.h + 0.9} textAnchor="end">
                  0
                </text>
                <text className="bp-tiny" x={g.x - 1.4} y={top[1] + 0.9} textAnchor="end">
                  {Math.round(full)}
                </text>
                {[0, 50, 100].map((p) => (
                  <text key={p} className="bp-tiny" x={at(p)[0]} y={g.y + g.h + 4} textAnchor="middle">
                    {p}%
                  </text>
                ))}
              </g>
            );
          })()}

        {detail === 'climate' &&
          (() => {
            const inside = sheet.insideC != null ? sheet.toTemp(sheet.insideC) : null;
            const outside = sheet.outsideC != null ? sheet.toTemp(sheet.outsideC) : null;
            const temps = [inside, outside].filter((v): v is number => v != null);
            if (!temps.length)
              return (
                <text className="bp-small" x={view.x + view.w / 2} y={view.y + view.h / 2} textAnchor="middle">
                  {tr('Not measured yet')}
                </text>
              );
            // A thermometer scale, the way a drawing gives a range: cabin above it, outside below.
            const lo = Math.floor((Math.min(...temps) - 4) / 5) * 5;
            const hi = Math.ceil((Math.max(...temps) + 4) / 5) * 5;
            const s = { x: view.x + 12, w: view.w - 24, y: view.y + view.h / 2 + 2 };
            const xOf = (c: number) => s.x + ((c - lo) / (hi - lo)) * s.w;
            const mark = (c: number, word: string, above: boolean, on?: boolean) => {
              const mx = xOf(c);
              const tip = above ? s.y - 1 : s.y + 1;
              const ly = above ? s.y - 14 : s.y + 14;
              return (
                <g>
                  <path className="bp-mark-fill" d={above ? `M${mx} ${tip} l-1.6 -2.6 h3.2 Z` : `M${mx} ${tip} l-1.6 2.6 h3.2 Z`} />
                  <path className="bp-lead" d={`M${mx} ${above ? tip - 2.6 : tip + 2.6} V${ly + (above ? 2 : -6)}`} />
                  <text className="bp-tiny" x={mx} y={above ? ly - 7 : ly + 1} textAnchor="middle">
                    {word}
                    {on ? ` · ${tr('Climate on')}` : ''}
                  </text>
                  <text className="bp-metric" x={mx} y={above ? ly : ly + 8} textAnchor="middle">
                    {Math.round(c)}°
                  </text>
                </g>
              );
            };
            return (
              <g>
                <line className="bp-rule" x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y} />
                {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((c) => (
                  <line key={c} className={c % 5 ? 'bp-rule-soft' : 'bp-axis'} x1={xOf(c)} y1={s.y - (c % 5 ? 1 : 2)} x2={xOf(c)} y2={s.y + (c % 5 ? 1 : 2)} />
                ))}
                <text className="bp-tiny" x={s.x} y={s.y + 5.4} textAnchor="middle">
                  {lo}°
                </text>
                <text className="bp-tiny" x={s.x + s.w} y={s.y + 5.4} textAnchor="middle">
                  {hi}°
                </text>
                {inside != null && mark(inside, tr('Cabin'), true, sheet.climate)}
                {outside != null && mark(outside, tr('Outside'), false)}
              </g>
            );
          })()}

        {detail === 'tires' && (
          <Plot
            box={plotBox}
            title={tr('Tire pressures, last 7 days')}
            unit={sheet.unit}
            format={(v) => sheet.tireText(v)}
            traces={sheet.tires.map((t) => ({ data: sheet.week.tires[t.pos], label: t.pos.toUpperCase(), soft: t.soft }))}
          />
        )}
        {detail === 'charge' && (
          <Plot
            box={plotBox}
            title={tr('Charge, last 7 days')}
            unit="%"
            lo={0}
            hi={100}
            format={(v) => `${Math.round(v)}`}
            limit={{ v: sheet.limit, label: `${tr('Limit')} ${sheet.limit}%` }}
            traces={[{ data: sheet.week.battery, label: `${sheet.battery}%`, soft: sheet.low }]}
          />
        )}
        {detail === 'range' && (
          <Plot
            box={plotBox}
            title={tr('Range, last 7 days')}
            lo={0}
            format={(v) => sheet.dist(v)}
            traces={[{ data: perPct ? sheet.week.battery?.map(([t, v]) => [t, v * perPct] as [number, number]) : undefined, label: tr('Range') }]}
          />
        )}
        {detail === 'climate' && (
          <Plot
            box={plotBox}
            title={tr('Cabin and outside, last 24 hours')}
            day
            format={(v) => `${Math.round(v)}°`}
            traces={[
              { data: sheet.day.inside?.map(([t, v]) => [t, sheet.toTemp(v)] as [number, number]), label: tr('Cabin') },
              { data: sheet.day.outside?.map(([t, v]) => [t, sheet.toTemp(v)] as [number, number]), label: tr('Outside') },
            ]}
          />
        )}
      </svg>
    </div>
  );
}
