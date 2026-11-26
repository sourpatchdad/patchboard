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
  {
    id: 'modely-2020',
    name: 'Model Y, 2020 to 2024',
    model: 'Model Y',
    views: [
      { view: 'side', aspect: 2.476, at: { fl: [19.5, 73.5], fr: null, rl: [79.7, 74.6], rr: null }, port: [94.1, 39.6] },
      { view: 'front', aspect: 1.235, at: { fl: [88.1, 93.8], fr: [11.4, 93.8], rl: null, rr: null } },
      { view: 'rear', aspect: 1.181, at: { fl: null, fr: null, rl: [10.4, 93.8], rr: [88.6, 93.8] } },
      { view: 'top', aspect: 1.971, at: { fl: [18.8, 87.8], fr: [18.8, 13.9], rl: [78.6, 87.8], rr: [78.6, 13.9] } },
      { view: 'front34', aspect: 1.778, at: { fl: [58.8, 76.2], fr: [11.9, 89.9], rl: [92.7, 63.7], rr: null } },
      { view: 'rear34', aspect: 1.957, at: { fl: [7.9, 65.9], fr: null, rl: [45.3, 73.6], rr: [86.2, 86.9] }, port: [53.7, 37.1] },
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
