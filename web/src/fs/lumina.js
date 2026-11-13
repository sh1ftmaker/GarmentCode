// FreeSewing "Lumina" leggings (https://freesewing.eu/designs/lumina/, MIT, design by Wouter
// Van Wageningen): each leg is one piece that wraps from the front crotch seam round the
// inside of the leg to the back crotch seam (no inseam), closed down the outside by a side
// panel; a shaped waistband and optional patch pockets on the panels. Drafted with negative
// ease for stretch knits. Measurements from the mannequin, options as sliders, seam table and
// placement around the hips and legs for the drape (legwear.js); the pockets are cut but not
// simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, waistBandMap, partOutline } from './lower.js';
import { loc, opsPoly, xAtY, clipLoop, legPairPlacement } from './legwear.js';

export const id = 'lumina';
export const name = 'Lumina leggings';
export const short = 'Leggings';
export const exportName = 'Lumina';
export const url = 'https://freesewing.eu/designs/lumina/';
export const author = 'Wouter Van Wageningen';
export const settings = { expand: true };
export const icon = 'M16 6h24l1 8-2 38h-8l-3-30-3 30h-8l-2-38zM17 16l-2 36M39 16l2 36';
export const stretchNote = 'Lumina is drafted with negative ease for stretch knits. The 3D drape uses a relaxed copy (a quarter of the negative ease) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern. The waistband is cut twice (band and facing) and the drape shows one layer; the pockets are cut but not simulated.';

export const design = {
  fit: {
    ease: { v: -8, range: [-25, 10], type: 'float', fs: 'pct', name: 'Ease (%)', help: 'Controls the amount of ease. Leggings are normally made from stretch fabric, so the ease is negative.' },
    waistreduction: { v: 4, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist circumference reduction (%)', help: 'The amount by which the waist is reduced (a percentage of the waist).' },
  },
  style: {
    length: { v: 35, range: [10, 100], type: 'float', fs: 'pct', name: 'Leg length (%)', help: 'The length of the legs.' },
    sidepanel: { v: 25, range: [10, 40], type: 'float', fs: 'pct', name: 'Side panel size (%)', help: 'Width of the side panel (a percentage of the waist).' },
    fixedsidepanel: { v: false, type: 'bool', fs: 'bool', name: 'Fixed-width side panel', help: 'A side panel of one width all the way down, rather than a shaped one.' },
    waistlowering: { v: 35, range: [-10, 60], type: 'float', fs: 'pct', name: 'Waist lowering (%)', help: 'Lowers the waist (a percentage of the waist to hips measurement).' },
    waistband: { v: true, type: 'bool', fs: 'bool', name: 'Waistband', help: 'Adds a separate waistband.' },
    waistbandsize: { v: 50, range: [0, 150], type: 'float', fs: 'pct', name: 'Waistband size (%)', help: 'Height of the waistband (a percentage of the waist to hips measurement).' },
    lowerwaistbandback: { v: true, type: 'bool', fs: 'bool', name: 'Waistband lowering', help: 'Lowers the waistband at the back.' },
    pocket: { v: true, type: 'bool', fs: 'bool', name: 'Pocket', help: 'Adds pockets on the side panels.' },
    pocketdepth: { v: 90, range: [20, 120], type: 'float', fs: 'pct', name: 'Pocket depth (%)', help: 'Depth of the pocket (a percentage of the waist to seat measurement).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.ease = o.ease < 0 ? o.ease * 0.25 : o.ease;   // the simulated cloth barely stretches
  return o;
}

const MEASUREMENTS = ['waist', 'waistBack', 'hips', 'seat', 'seatBack', 'inseam', 'waistToSeat', 'waistToUpperLeg', 'waistToKnee',
  'waistToHips', 'waistToFloor', 'knee', 'ankle', 'crossSeam', 'crossSeamFront', 'heel', 'upperLeg'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/lumina; y = 0 at the natural waist; the wearer's right leg):
 *  leg (front towards -x, back towards +x, the crotch point middleCrossSeam at x = 0): hem
 *    frontSplitHem -> backSplitHem, back split seam -> backSplitWaistband, waist ->
 *    backWaistband, back crotch seam -> middleCrossSeam, front crotch seam -> frontWaistband,
 *    waist -> frontSplitWaistband, front split seam -> frontSplitHem.
 *  panel (outseam at x = 0, front towards +x): hem backPanelHem -> frontPanelHem, front edge
 *    -> frontPanelWaistband, top -> backPanelWaistband, back edge -> backPanelHem.
 *  waistband (on the fold at its centre front, 0): 1 top, 2 centre back end (down), 3-4 the
 *    sewn edge from the centre back to the centre front.
 */
function edges(draft) {
  const parts = draft.parts[0], lp = parts['lumina.leg'], pp = parts['lumina.panel'];
  const L = lp.points, Q = pp.points;
  return {
    lp, pp, L, Q,
    bSplit: opsBetween(lp, L.backSplitHem, L.backSplitWaistband), bWaist: opsBetween(lp, L.backSplitWaistband, L.backWaistband),
    bCrotch: opsBetween(lp, L.backWaistband, L.middleCrossSeam), fCrotch: opsBetween(lp, L.middleCrossSeam, L.frontWaistband),
    fWaist: opsBetween(lp, L.frontWaistband, L.frontSplitWaistband), fSplit: opsBetween(lp, L.frontSplitWaistband, L.frontSplitHem),
    pFront: opsBetween(pp, Q.frontPanelHem, Q.frontPanelWaistband), pTop: opsBetween(pp, Q.frontPanelWaistband, Q.backPanelWaistband),
    pBack: opsBetween(pp, Q.backPanelWaistband, Q.backPanelHem),
  };
}
const part = (draft, k) => { const p = draft.parts[0][k]; return p && !p.hidden && p.paths.seam ? p : null; };

export function spec(o, draft) {
  const E = edges(draft), band = part(draft, 'lumina.waistband'), pocket = part(draft, 'lumina.pocket');
  const seams = [];
  for (const s of ['_r', '_l']) {
    seams.push(
      { a: chain('leg' + s, E.fSplit), b: chain('panel' + s, E.pFront, true) },   // front split seam, down
      { a: chain('leg' + s, E.bSplit), b: chain('panel' + s, E.pBack, true) },    // back split seam, up
    );
  }
  seams.push(
    { a: chain('leg_r', E.fCrotch), b: chain('leg_l', E.fCrotch) },   // centre front, crotch up
    { a: chain('leg_r', E.bCrotch), b: chain('leg_l', E.bCrotch) },   // centre back, down to the crotch
  );
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...E.fWaist.map(i => ['leg' + s, i]), ...E.bWaist.map(i => ['leg' + s, i]), ...E.pTop.map(i => ['panel' + s, i]));
  if (band) {
    // the band's lower edge from the centre back round the right to the centre front, and on
    // round the left to the centre back; its ends meet at the centre back
    seams.push(
      { a: [...chain('leg_r', E.bWaist, true), ...chain('panel_r', E.pTop, true), ...chain('leg_r', E.fWaist, true),
            ...chain('leg_l', E.fWaist), ...chain('panel_l', E.pTop), ...chain('leg_l', E.bWaist)],
        b: [['waistband', 3], ['waistband', 4], ['waistband', 'm4', true], ['waistband', 'm3', true]] },
      { a: [['waistband', 2]], b: [['waistband', 'm2']] },
    );
    lab.push(['waistband', 1], ['waistband', 'm1']);
  }
  return {
    pieces: [
      { name: 'leg_r', part: 'lumina.leg' },
      { name: 'leg_l', part: 'lumina.leg', mirror: true },
      { name: 'panel_r', part: 'lumina.panel' },
      { name: 'panel_l', part: 'lumina.panel', mirror: true },
      ...(band ? [{ name: 'waistband', part: 'lumina.waistband', fold: 0, label: 'body', lining: true, follow: 6 }] : []),
      ...(pocket ? [{ name: 'patch_r', part: 'lumina.pocket', cutOnly: true }, { name: 'patch_l', part: 'lumina.pocket', mirror: true, cutOnly: true }] : []),
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
const DROP = 2;   // start below the designed waist; the waist attachment brings it back up (garment.js)

export function placement(draft, m, body) {
  const W = waistY(m), E = edges(draft), L = E.L, parts = draft.parts[0];
  // the panel's half widths and the split seams' x at each height (panel and split seams
  // are drafted to the same heights)
  const pF = xAtY(opsPoly(E.pp, E.pFront)), pB = xAtY(opsPoly(E.pp, E.pBack));
  const sF = xAtY(opsPoly(E.lp, E.fSplit)), sB = xAtY(opsPoly(E.lp, E.bSplit));
  const loop = partOutline(E.lp), cs = loc(L.middleCrossSeam), id = (p) => p;
  const front = { part: E.lp, outline: clipLoop(loop, -1), T: id, cs, forkY: cs[1], centre: opsPoly(E.lp, E.fCrotch), extra: (y) => pF(y) };
  const back = { part: E.lp, outline: clipLoop(loop, 1), T: id, cs, forkY: cs[1], centre: opsPoly(E.lp, E.bCrotch), extra: (y) => -pB(y) };
  // Titan's frame has the front's centre at +x: Lumina's front is already so (its split
  // seam, the outer edge, at -x), and the back's centre at -x of its split seam
  const legs = legPairPlacement(body, W, { front, back, wrap: true });
  const M = legs.maps;
  const side = (ps, f) => {
    const sx = ps.mirror ? -1 : 1, l = /_l$/.test(ps.name);
    return (x, y) => { const p = f(sx * x, y); return l ? [-p[0], p[1], p[2]] : p; };
  };
  const leg = (x, y) => (x <= 0 ? M.front(x, y) : M.back(x, y));
  // panel: either half in the frame of the leg's half it is sewn to, beyond its split seam
  const panel = (x, y) => (x >= 0 ? M.front(sF(y) - (pF(y) - x), y) : M.back(sB(y) + (x - pB(y)), y));
  const maps = {};
  const band = part(draft, 'lumina.waistband');
  if (band) {
    const wb = band.points, xf = wb.waistbandFront.x / 10;
    const ends = Object.values(wb).filter(p => Math.abs(p.y) < 1e5);
    const len = 2 * (xf - Math.min(...ends.map(p => p.x / 10)));
    const yb = Math.min(...ends.map(p => -p.y / 10));
    const bm = waistBandMap(body, legs.sections, { Y: W + loc(L.frontWaistband)[1], len });
    maps.waistband = (x, y) => bm(((xf - x) % len + len) % len, Math.max(0, y - yb - 2));
  }
  const drop = (f) => (x, y) => { const p = f(x, y); return [p[0], p[1] - DROP, p[2]]; };
  return (ps) => {
    if (maps[ps.name]) return drop(maps[ps.name]);
    return drop(side(ps, ps.name.startsWith('panel') ? panel : leg));
  };
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], L = parts['lumina.leg'].points;
  let top = Math.max(...['frontWaistband', 'frontSplitWaistband', 'backWaistband', 'backSplitWaistband'].map(k => loc(L[k])[1]));
  const band = part(draft, 'lumina.waistband');
  if (band) top += draft.setStores[0].get('waistbandSize') / 10;
  return { lower_interface: waistY(m) + top };
}
export const lift = 0;
