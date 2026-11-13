// FreeSewing "Sophie" slip dress (https://freesewing.eu/designs/sophie/, MIT, design by
// JenBarb_): a bias-cut slip dress with a gathered bust. The front and back panels (each cut
// on the fold, on the bias) run from the underbust to the hem; two cups (gathered onto the
// front panel) and two back straps (on the back panel) meet at the side seams and in thin
// straps over the shoulders. Measurements from the mannequin, options as sliders, seam table
// and placement around the torso and lower body for the drape.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions, skirtSections, skirtMap } from './lower.js';
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop, fitAffine } from './convert.js';

export const id = 'sophie';
export const name = 'Sophie slip dress';
export const short = 'Slip dress';
export const exportName = 'Sophie';
export const url = 'https://freesewing.eu/designs/sophie/';
export const author = 'JenBarb_';
export const icon = 'M20 4l2 14c3 2 9 2 12 0l2-14M18 18c-1 6-1 8 0 10l-6 24c10 3 22 3 32 0l-6-24c1-2 1-4 0-10-6 3-14 3-20 0z';
export const stretchNote = 'The cups are cut longer at the bottom than the top of the front panel and gathered onto it; the drape gathers them by sewing the two edges along each other. The panels are cut on the bias, which the drape models with the grain. The cup and back strap linings are cut, not draped.';

export const design = {
  fit: {
    bustEase: { v: 5, range: [0, 25], type: 'float', fs: 'pct', name: 'Bust ease (%)', help: 'How much room do you want around the bust?' },
    underbustEase: { v: 5, range: [0, 25], type: 'float', fs: 'pct', name: 'Underbust ease (%)', help: 'How much room do you want around the underbust?' },
    waistEase: { v: 5, range: [0, 25], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'How much room do you want around the waist?' },
    hipsEase: { v: 5, range: [0, 25], type: 'float', fs: 'pct', name: 'Hips ease (%)', help: 'How much room do you want around the hips?' },
    seatEase: { v: 5, range: [0, 25], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'How much room do you want around the seat?' },
    armholeDrop: { v: 80, range: [50, 90], type: 'float', fs: 'pct', name: 'Armhole drop (%)', help: 'How much to lower the armhole.' },
  },
  style: {
    strapWidth: { v: 30, range: [10, 100], type: 'float', fs: 'pct', name: 'Strap width (%)', help: 'How wide do you want your shoulder straps?' },
    necklineCoverage: { v: 20, range: [0, 90], type: 'float', fs: 'pct', name: 'Neckline coverage (%)', help: 'How far up the neckline will be covered.' },
    backCoverage: { v: 10, range: [-50, 90], type: 'float', fs: 'pct', name: 'Back coverage (%)', help: 'Controls how far up the back will be covered.' },
    sideCornerDrop: { v: 50, range: [0, 100], type: 'float', fs: 'pct', name: 'Side corner drop (%)', help: 'How far down the cups go on the side between the underbust and the waist.' },
    lengthBonus: { v: 0, range: [-50, 50], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'The length of the dress, as a percentage of the natural waist to knee measurement.' },
    bottomWidthBonus: { v: 20, range: [0, 100], type: 'float', fs: 'pct', name: 'Bottom width bonus (%)', help: 'How much room there is around the legs at the bottom of the dress.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['bustSpan', 'hpsToBust', 'hpsToWaistBack', 'bustPointToUnderbust', 'bustFront', 'shoulderToShoulder',
  'shoulderSlope', 'underbust', 'waist', 'hips', 'seat', 'waistToUnderbust', 'waistToHips', 'waistToSeat', 'waistToKnee'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/** FreeSewing draws the cups and straps as `cup` / `backStrap` paths and leaves the panels' fold open: give each part a closed seam path. */
function seamPaths(draft) {
  const parts = draft.parts[0];
  for (const [k, path] of [['cup', 'cup'], ['backStrap', 'backStrap']]) {
    const p = parts[`sophie.${k}`];
    if (!p.paths.seam) p.paths.seam = { ops: p.paths[path].ops };
  }
  for (const k of ['frontPanel', 'backPanel']) {
    const p = parts[`sophie.${k}`];
    if (!p.__closed) {
      p.paths.seam = { ops: [...p.paths.seam.ops.filter(op => op.type !== 'close'), { type: 'close' }] };
      p.__closed = true;
    }
  }
}

/*
 * Edges:
 *  front / back panel (cut on the fold, 6 = centre): 0 hem (centre -> side), 1-4 side seam
 *    (up), 5 top (side -> centre, sewn to the cup / back strap)
 *  cup / back strap: 0 side (a -> b, down), 1 bottom (b -> c, side -> centre), 2 neckline
 *    (c -> d, up to the strap), 3 shoulder (d -> e), 4 armhole (e -> a)
 * The front's own half (local +x) is the wearer's left, the back's mirrored half; the
 * unmirrored cup and strap are on the left.
 */
export function spec(o, draft) {
  seamPaths(draft);
  const seams = [];
  for (const [s, f, b] of [['l', '', 'm'], ['r', 'm', '']]) {
    const cup = `cup_${s}`, st = `strap_${s}`;
    seams.push(
      { a: [1, 2, 3, 4].map(k => ['front', f + k]), b: [1, 2, 3, 4].map(k => ['back', b + k]) },   // side seams
      { a: [['front', f + 5]], b: [[cup, 1]] },          // the cup gathered onto the front
      { a: [['back', b + 5]], b: [[st, 1]] },            // back strap onto the back
      { a: [[cup, 0]], b: [[st, 0]] },                   // side seam above the panels
      { a: [[cup, 3]], b: [[st, 3]] },                   // shoulder
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'sophie.frontPanel', fold: 6, label: 'body' },
      { name: 'back', part: 'sophie.backPanel', fold: 6, label: 'body' },
      { name: 'cup_l', part: 'sophie.cup', label: 'body', lining: true },
      { name: 'cup_r', part: 'sophie.cup', mirror: true, label: 'body', lining: true },
      { name: 'strap_l', part: 'sophie.backStrap', label: 'body', lining: true },
      { name: 'strap_r', part: 'sophie.backStrap', mirror: true, label: 'body', lining: true },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  seamPaths(draft);
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const fsm = measurements(m, body);
  const Yub = F.Yhps - (fsm.hpsToBust + fsm.bustPointToUnderbust) / 10;   // FreeSewing's y = 0 on the panels: the underbust
  // panels: around the body below the underbust, like a skirt
  const sf = outlineSpan(pieceLoop(parts['sophie.frontPanel'], { fold: 6 })), sb = outlineSpan(pieceLoop(parts['sophie.backPanel'], { fold: 6 }));
  const half = (sp, y) => (sp(Math.max(sp.y0, Math.min(sp.y1, y))) || [0, 0])[1];
  const girth = (y) => 2 * (half(sf, y) + half(sb, y));
  const S = skirtMap(skirtSections(body, Yub + 20), { waistY: Yub, girth, gap: 1.5 });
  // cups and straps: onto a virtual bodice (x = distance from the centre, y = height below
  // the high shoulder point), fitted through their corners, then around the torso
  const C = parts['sophie.cup'].points, B = parts['sophie.backStrap'].points;
  const L = (p) => [p.x / 10, -p.y / 10];
  const Gs = Math.max(half(sf, 0), fsm.underbust / 40);   // half the front's width at the underbust
  const hx = Math.max(m.neck_w / 2 + 1, fsm.shoulderToShoulder / 40);
  const ya = L(C.a)[1], yb = L(C.b)[1];
  const cupFit = fitAffine([[L(C.a), [Gs, ya]], [L(C.b), [Gs, yb]], [L(C.c), [0, L(C.c)[1]]], [L(C.d), [hx, 0]], [L(C.e), [hx + 2, L(C.e)[1]]]]);
  const strapFit = fitAffine([[L(B.a), [Gs, ya]], [L(B.b), [Gs, yb]], [L(B.c), [0, L(B.c)[1] + ya - L(B.a)[1]]], [L(B.d), [hx, 0]], [L(B.e), [hx + 2, L(B.e)[1]]]]);
  const tg = () => 2 * Gs;
  const front = torsoMap(F, { side: 1, xSign: 1, hps: [hx, 0], girth: tg, armholeY: ya });
  const back = torsoMap(F, { side: -1, xSign: -1, hps: [hx, 0], girth: tg, armholeY: ya });
  return (ps) => {
    if (ps.name === 'front') return (x, y) => S(x, y);
    if (ps.name === 'back') return (x, y) => S(girth(y) / 2 + x, y);
    const left = ps.name.endsWith('_l'), cup = ps.name.startsWith('cup');
    const fit = cup ? cupFit : strapFit;
    return (x, y) => {
      const [u, v] = fit(ps.mirror ? -x : x, y);
      const ux = Math.max(0, u);
      return cup ? front(left ? ux : -ux, v) : back(left ? -ux : ux, v);
    };
  };
}

export const attachLevels = () => ({});
export const lift = 2;
