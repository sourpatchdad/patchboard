// The cars Patchboard has drawings of. You pick yours on the Tessie connection
// (TESSIE_CAR), or leave it to match the model Tessie reports; the Car widget
// then draws that car with nothing to upload. Each view is a transparent
// line drawing in server/car-art/<id>/<view>.webp, trimmed to the car, with
// where its tires and charge port sit in percent of the image.

import type { CarPicture } from './car-pictures.ts';

export interface CarArt {
  id: string;
  /** As the Settings menu lists it. */
  name: string;
  /** The model name Tessie reports, for matching when nothing is picked. */
  model: string;
  views: Omit<CarPicture, 'src'>[];
}

export const CAR_ART: CarArt[] = [
  {
    id: 'model3-2017',
    name: 'Model 3, 2017 to 2023',
    model: 'Model 3',
    views: [
      { view: 'side', aspect: 3.228, at: { fl: [19.4, 76], fr: null, rl: [81.9, 76], rr: null }, port: [95.6, 36.7] },
      { view: 'front', aspect: 1.549, at: { fl: [88, 90], fr: [14, 90], rl: null, rr: null } },
      { view: 'rear', aspect: 1.506, at: { fl: null, fr: null, rl: [13, 91], rr: [87, 91] } },
      { view: 'top', aspect: 2.246, at: { fl: [18, 84.3], fr: [18, 11.5], rl: [79, 84.3], rr: [79, 11.5] } },
      { view: 'front34', aspect: 2.123, at: { fl: [45.5, 71.9], fr: [12.1, 85.8], rl: [91.5, 64.6], rr: null } },
      { view: 'rear34', aspect: 1.953, at: { fl: [7.3, 64.2], fr: null, rl: [45.3, 73.5], rr: [85.5, 84.6] }, port: [55.1, 38.8] },
    ],
  },
];

/** TESSIE_CAR: match the model (the default), one car by id, or the plain outline. */
export const CAR_AUTO = 'auto';
export const CAR_OUTLINE = 'outline';

/** Which drawing a car gets: the one you picked, else the first for its model, else none (the outline). */
export function artFor(picked: string | undefined, model: string | undefined): string | undefined {
  if (picked === CAR_OUTLINE) return undefined;
  if (picked && picked !== CAR_AUTO) return CAR_ART.find((a) => a.id === picked)?.id;
  return model ? CAR_ART.find((a) => a.model === model)?.id : undefined;
}

/** A car's views, ready to draw, or none for the outline. */
export function artViews(id: string | undefined): CarPicture[] {
  const art = id ? CAR_ART.find((a) => a.id === id) : undefined;
  return art ? art.views.map((v) => ({ ...v, src: `/api/car-art/${art.id}/${v.view}.webp` })) : [];
}
