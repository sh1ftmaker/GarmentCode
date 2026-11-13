// FreeSewing "Diana" draped top (https://freesewing.eu/designs/diana/, MIT, design by
// Erica Alcusa Sáez): a Brian-based top with a cowl neck. The front's armhole and shoulder
// are turned up around the armpit (the drape angle), so the front neckline is much longer
// than the neck and falls in folds. Measurements from the mannequin, options as sliders,
// seam table and placement around the torso and arms for the drape.
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop } from './convert.js';
import { brianTorso, brianSleeves, treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'diana';
export const name = 'Diana draped top';
export const short = 'Draped top';
export const exportName = 'Diana';
export const url = 'https://freesewing.eu/designs/diana/';
export const author = 'Erica Alcusa Sáez';
export const icon = 'M17 7l5-1c2 6 10 6 12 0l5 1 10 9 3 30-6 1-4-25v30H18V22l-4 25-6-1 3-30zM22 9c2 8 10 8 12 0';
export const stretchNote = 'The cowl is not drawn in the pattern: the front is cut taller than the neck (turned up at the armholes), and in the drape the excess folds over and down in front of the chest under its own weight.';

const KEEP = new Set(['drapeAngle']);   // degrees, not a percentage
export const design = {
  fit: {
    chestEase: { v: 0, range: [-10, 20], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest.' },
    waistEase: { v: 0, range: [-10, 20], type: 'float', name: 'Waist ease (%)', help: 'Room at the waist.' },
    hipsEase: { v: 0, range: [-10, 20], type: 'float', name: 'Hips ease (%)', help: 'Room around the hips.' },
    bicepsEase: { v: 0, range: [-5, 50], type: 'float', name: 'Biceps ease (%)', help: 'Room in the upper sleeves.' },
    cuffEase: { v: 20, range: [0, 30], type: 'float', name: 'Cuff ease (%)', help: 'Room at the sleeve hem.' },
  },
  style: {
    drapeAngle: { v: 20, range: [10, 30], type: 'float', name: 'Drape angle (°)', help: 'How far the front is turned up at the armhole: more angle, a deeper cowl.' },
    shoulderSeamLength: { v: 35, range: [0.1, 60], type: 'float', name: 'Shoulder seam length (%)', help: 'Share of the shoulder that is sewn; the rest is the neckline.' },
    lengthBonus: { v: 0, range: [0, 50], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens (or shortens) the sleeves.' },
  },
};

export const options = (d) => treeOptions(d, KEEP);
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'waist', 'shoulderToWrist', 'wrist', 'highBust'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges: front/back (cut on the fold, 8 = centre): 0 hem (centre -> side), 1-2 side seam (up),
 *   3-5 armhole (side -> shoulder), 6 shoulder seam (-> neck), 7 neckline (-> centre)
 * sleeve: 0 back underarm (up), 1-5 cap (back -> front), 6 front underarm (down), 7 hem
 * The front's local +x, the back's mirrored half and the unmirrored sleeve are the wearer's left.
 */
export function spec() {
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), b = (k) => (s > 0 ? 'm' + k : String(k)), sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: [['front', f(1)], ['front', f(2)]], b: [['back', b(1)], ['back', b(2)]] },
      { a: [['front', f(6)]], b: [['back', b(6)]] },
      { a: [['back', b(3)], ['back', b(4)], ['back', b(5)], ['front', f(5), true], ['front', f(4), true], ['front', f(3), true]], b: [1, 2, 3, 4, 5].map(k => [sl, k]) },
      { a: [[sl, 0]], b: [[sl, 6, true]] },
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'diana.front', fold: 8, label: 'body' },
      { name: 'back', part: 'diana.back', fold: 8, label: 'body' },
      { name: 'sleeve_l', part: 'diana.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'diana.sleeve', mirror: true, label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const front = parts['diana.front'], back = parts['diana.back'];
  const F = upperFrame(body, m);
  const T = brianTorso(F, front, back, { shoulderEdge: 6, setIn: true });
  // The front starts as an ordinary bodice: its armhole and shoulder turned back down by the
  // drape angle (around the armpit, where FreeSewing turned them up), fading out towards the
  // centre front and below the armhole. The centre of the neckline then stands up above the
  // neck and drops into the cowl in the drape.
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const A = P(front.points.armhole), N = P(front.points.neck), S = P(front.points.shoulder);
  const a = (draft.settings[0].options.drapeAngle ?? 20) * Math.PI / 180;
  const turn = (x, y, w) => {
    const dx = x - A[0], dy = y - A[1], c = Math.cos(a * w), s = Math.sin(a * w);
    return [A[0] + c * dx - s * dy, A[1] + s * dx + c * dy];
  };
  const n = turn(...N, 1), sh = turn(...S, 1);
  const sf = outlineSpan(pieceLoop(front, { fold: 8 })), sb = outlineSpan(pieceLoop(back, { fold: 8 }));
  const half = (s, y) => { const r = s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  const girth = (y) => half(sf, y) + half(sb, y);
  const Tf = torsoMap(F, {
    side: 1, xSign: 1, hps: n, slope: Math.max(0, (n[1] - sh[1]) / Math.max(1, sh[0] - n[0])),
    girth, armholeY: T.armholeY, shoulderX: sh[0], armholeX: A[0], gap: 1.5,
  });
  const bodice = (x, y) => {
    const w = sm(Math.abs(x) / Math.max(1, N[0])) * sm((y - (A[1] - 8)) / 8);
    const [u, v] = turn(Math.abs(x), y, w);
    return Tf(Math.sign(x) * u, v);
  };
  // What lies above an ordinary (Brian-deep) front neckline starts folded over it, hanging
  // in front of the chest (a semicircle of radius R, then straight down): released, the
  // excess length falls into the cowl instead of standing up around the neck.
  const depth = 0.9 * (F.m.neck_w / 2 + 2), R = 1.5;
  const foldY = (ax) => N[1] - depth * Math.max(0, 1 - (ax / N[0]) ** 2);
  const frontMap = (x, y) => {
    const ax = Math.abs(x), y0 = foldY(ax), e = y - y0;
    if (ax >= N[0] || e <= 0) return bodice(x, y);
    const P0 = bodice(x, y0), S0 = F.sec(P0[1]);
    let nx = P0[0] - S0.xc, nz = P0[2] - S0.zc;
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const th = Math.min(e / R, Math.PI), down = Math.max(0, e - Math.PI * R);
    const o = R * (1 - Math.cos(th));
    return [P0[0] + o * nx, P0[1] + R * Math.sin(th) - down, P0[2] + o * nz];
  };
  const sleeves = brianSleeves(F, parts['diana.sleeve'], { atCrease: true });
  return (ps) => {
    if (ps.name === 'front') return frontMap;
    if (ps.name === 'back') return T.back;
    return sleeves[!!ps.mirror].map;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
