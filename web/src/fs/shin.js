// FreeSewing "Shin" swim trunks (https://freesewing.eu/designs/shin/, MIT, design by Joost
// De Cock): a front and a back per leg, drafted from the hips down with negative ease for
// stretch fabric, and an elastic casing waistband. Measurements from the mannequin, options
// as sliders, seam table and placement around the hips and legs for the drape (legwear.js).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, waistBandMap } from './lower.js';
import { loc, rigid, opsPoly, legPairPlacement } from './legwear.js';

export const id = 'shin';
export const name = 'Shin swim trunks';
export const short = 'Swim trunks';
export const exportName = 'Shin';
export const url = 'https://freesewing.eu/designs/shin/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the waistband too
export const icon = 'M10 12h36l4 22c-6 2-12 2-17 0l-5-8-5 8c-5 2-11 2-17 0zM10 12v-4h36v4';
export const stretchNote = 'Shin is drafted with negative ease for stretch swimwear. The 3D drape uses a relaxed copy (no stretch) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern. The waistband is draped as one layer of the folded casing.';

export const design = {
  fit: {
    stretch: { v: 20, range: [10, 30], type: 'float', fs: 'pct', name: 'Stretch (%)', help: 'The amount of stretch to design for.' },
    bulge: { v: 2.5, range: [0, 5], type: 'float', fs: 'pct', name: 'Bulge (%)', help: 'Controls the amount of extra room to create at the front of the trunks.' },
    legReduction: { v: 5, range: [0, 10], type: 'float', fs: 'pct', name: 'Leg reduction (%)', help: 'Reduces the leg opening to prevent gaping.' },
    backRise: { v: 5, range: [0, 10], type: 'float', fs: 'pct', name: 'Back rise (%)', help: 'Controls how much the waist is higher in the back than the front.' },
  },
  style: {
    rise: { v: 0, range: [0, 25], type: 'float', fs: 'pct', name: 'Rise (%)', help: 'Controls the height of the waist.' },
    elasticWidth: { v: 10, range: [4, 20], type: 'float', fs: 'pct', name: 'Elastic width (%)', help: 'Width of the elastic at the waist.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  // the simulated cloth barely stretches: the drape uses the pattern drafted for no stretch
  if (relaxed) o.stretch = 0;
  return o;
}

const MEASUREMENTS = ['hips', 'upperLeg', 'waistToUpperLeg', 'waistToHips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/shin; front and back alike, side seam at x = 0, centre
 * seam towards +x):
 *  inseam reducedLegInner -> reducedCrossSeam, centre seam -> hipCb, waist -> hipSide,
 *  side seam -> legSide, hem -> reducedLegInner.
 * The back is drafted for the wearer's left leg (as the front for the right one), so the
 * right leg's back is its mirrored copy.
 *  waistband: 1 long edge (sewn), 2 bottom end, 3 the other long edge (fold), 4 top end.
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['shin.front'], bp = parts['shin.back'];
  const e = (p) => {
    const P = p.points;
    return {
      inseam: opsBetween(p, P.reducedLegInner, P.reducedCrossSeam), centre: opsBetween(p, P.reducedCrossSeam, P.hipCb),
      waist: opsBetween(p, P.hipCb, P.hipSide), side: opsBetween(p, P.hipSide, P.legSide),
    };
  };
  return { F: e(fp), B: e(bp) };
}

export function spec(o, draft) {
  const { F, B } = edges(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    seams.push(
      { a: chain('front' + s, F.side), b: chain('back' + s, B.side) },       // side seam, waist down
      { a: chain('front' + s, F.inseam), b: chain('back' + s, B.inseam) },   // inseam (gusset), hem up
    );
  }
  seams.push(
    { a: chain('front_r', F.centre), b: chain('front_l', F.centre) },   // centre front, fork up
    { a: chain('back_r', B.centre), b: chain('back_l', B.centre) },     // centre back
  );
  // waistband: from the right centre front round the back to the left centre front; its
  // ends are joined (at the centre front)
  seams.push({
    a: [...chain('front_r', F.waist), ...chain('back_r', B.waist, true), ...chain('back_l', B.waist), ...chain('front_l', F.waist, true)],
    b: [['waistband', 1]],
  });
  seams.push({ a: [['waistband', 4]], b: [['waistband', 2, true]] });
  // the waist, and the waistband's folded top edge (held up at its designed height)
  const lab = [['waistband', 3]];
  for (const s of ['_r', '_l']) lab.push(...F.waist.map(i => ['front' + s, i]), ...B.waist.map(i => ['back' + s, i]));
  return {
    pieces: [
      { name: 'front_r', part: 'shin.front' },
      { name: 'front_l', part: 'shin.front', mirror: true },
      { name: 'back_r', part: 'shin.back', mirror: true },
      { name: 'back_l', part: 'shin.back' },
      { name: 'waistband', part: 'shin.waistband', label: 'body', doubled: 'x', follow: 6 },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's natural waist
// The pieces start DROP cm below their designed height; the waist attachment (start + 2 cm,
// garment.js) brings each waist point back up to it.
const DROP = 2;

/** Titan-frame transforms (the hip line is level, as drafted; y = 0 at the natural waist). */
function frames(draft) {
  const parts = draft.parts[0], wth = draft.settings[0].measurements.waistToHips / 10;
  const fr = (p, sx) => {
    const P = p.points;
    const T = rigid({ sx, t: [0, -wth] });
    return { part: p, T, cs: T(loc(P.seatCb)), forkY: T(loc(P.reducedCrossSeam))[1], centre: opsPoly(p, opsBetween(p, P.reducedCrossSeam, P.hipCb), T) };
  };
  const front = fr(parts['shin.front'], 1), back = fr(parts['shin.back'], -1);
  return { front, back };
}

export function placement(draft, m, body) {
  const W = waistY(m);
  const { front, back } = frames(draft);
  const legs = legPairPlacement(body, W, { front, back });
  const wb = draft.parts[0]['shin.waistband'].points;
  const band = waistBandMap(body, legs.sections, { Y: waistTop(draft, m), len: wb.bottomLeft.y / 10 });
  const drop = (f) => (x, y) => { const p = f(x, y); return [p[0], p[1] - DROP, p[2]]; };
  return (ps) => {
    if (ps.name === 'waistband') return drop((x, y) => band(-y, x));
    return drop(legs(ps));
  };
}

/** Highest designed point of the waist (world). */
function waistTop(draft, m) {
  const { front, back } = frames(draft), parts = draft.parts[0];
  const ys = ['shin.front', 'shin.back'].flatMap(k => ['hipCb', 'hipSide'].map(n => (k === 'shin.front' ? front : back).T(loc(parts[k].points[n]))[1]));
  return waistY(m) + Math.max(...ys);
}
export function attachLevels(draft, m) {
  // the top of the folded waistband (garment.js caps every attached point at its own start + 2 cm)
  return { lower_interface: waistTop(draft, m) + draft.parts[0]['shin.waistband'].points.topRight.x / 20 };
}
export const lift = 0;
