// FreeSewing "Jane" 1790s shift (https://freesewing.eu/designs/jane/, MIT, design by
// SeaZeeZee): a historical chemise cut from rectangles. The body is one rectangle cut on the
// fold over the shoulders; triangles cut off its sides along the gore lines are sewn into
// kites and set into the side seams below the corners as gores; rectangular sleeves with
// square underarm gussets are set into the gap left at the top of the side seams.
// Measurements from the mannequin, options as sliders, seam table and placement for the drape.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions } from './lower.js';
import { outlineSpan, upperFrame } from './place.js';
import { pieceLoop } from './convert.js';
import { bodyColumns, torsoBox, curtainMap } from './curtain.js';

export const id = 'jane';
export const name = 'Jane 1790s shift';
export const short = '1790s shift';
export const exportName = 'Jane';
export const url = 'https://freesewing.eu/designs/jane/';
export const author = 'SeaZeeZee';
export const icon = 'M20 6h16l4 2 10 12-5 5-5-5 6 30H10l6-30-5 5-5-5L16 8zM23 6c1 5 9 5 10 0';
export const stretchNote = 'The body is one rectangle cut on the fold over the shoulders; the gores are cut from its sides along the dashed lines. The pattern and cutting layout show the pieces as FreeSewing cuts them (body, sleeves, gussets); the 3D drape sews the cut-off gores into the side seams as the instructions describe.';

export const design = {
  fit: {
    bodyEase: { v: 21, range: [21, 50], type: 'float', fs: 'pct', name: 'Body ease (%)', help: 'Ease around the body (on the larger of chest and hips).' },
    bicepsEase: { v: 18, range: [18, 51], type: 'float', fs: 'pct', name: 'Biceps ease (%)', help: 'Ease around the upper arm, for the width of the sleeves.' },
    gussetSize: { v: 41, range: [41, 50], type: 'float', fs: 'pct', name: 'Gusset size (%)', help: 'Size of the underarm gussets, relative to the biceps.' },
  },
  style: {
    neckDepthFront: { v: 31, range: [25, 50], type: 'float', fs: 'pct', name: 'Neckline depth front (%)', help: 'Depth of the front neckline.' },
    neckDepthBack: { v: 18, range: [15, 50], type: 'float', fs: 'pct', name: 'Neckline depth back (%)', help: 'Depth of the back neckline.' },
    neckWidth: { v: 71, range: [65, 85], type: 'float', fs: 'pct', name: 'Neckline width (%)', help: 'Width of the neckline.' },
    shiftLength: { v: 2, range: [0, 20], type: 'float', fs: 'pct', name: 'Shift length (%)', help: 'Lengthens the shift (to the floor at most).' },
    sleeveLength: { v: 80, range: [60, 100], type: 'float', fs: 'pct', name: 'Sleeve length (%)', help: 'Length of the sleeves, relative to the shoulder to elbow length.' },
  },
};

// The drape cuts the body into its pieces (body front and back, four gore triangles); the
// pattern view keeps FreeSewing's cut list. `drape` tells spec() which one is wanted.
export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) Object.defineProperty(o, 'drape3d', { value: true, enumerable: false });
  return o;
}

const MEASUREMENTS = ['chest', 'hips', 'hpsToWaistBack', 'waistToKnee', 'shoulderToShoulder', 'neck', 'hpsToBust',
  'waistToFloor', 'biceps', 'shoulderToElbow'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// ------------------------------------------------------------------ synthetic parts
const pt = (p, dx = 0) => ({ x: p.x - dx, y: p.y });
/** Ops of a path run backwards (a move, then lines and curves). */
function reversed(path) {
  const ops = path.ops, out = [];
  let cur = null;
  const segs = [];
  for (const op of ops) {
    if (op.type === 'move') { cur = op.to; continue; }
    segs.push({ ...op, from: cur }); cur = op.to;
  }
  out.push({ type: 'move', to: segs[segs.length - 1].to });
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    out.push(s.type === 'curve' ? { type: 'curve', cp1: s.cp2, cp2: s.cp1, to: s.from } : { type: 'line', to: s.from });
  }
  return out;
}
/** A part made of the given ops (FreeSewing mm, y down), with the grain of `like`. */
function addPart(draft, name, ops, like) {
  const parts = draft.parts[0];
  parts[name] = { name, paths: { seam: { ops } }, points: {} };
  const cl = draft.setStores?.[0]?.cutlist;
  if (cl && cl[like]) cl[name] = { ...cl[like] };
}

/*
 * Drape pieces (local x = 0 at the centre, y = 0 on the shoulder fold):
 *  body front / back: 0 shoulder fold (leftShoulder -> neckLeft), 1-2 neckline (-> neckRight),
 *    3 shoulder fold (-> rightShoulder), 4 gore line (rightShoulder -> gorestartRight),
 *    5 side (-> bottomRight), 6 hem, 7 side (bottomLeft -> gorestartLeft), 8 gore line (-> leftShoulder)
 *  gore (cut-off triangle): 0 top (corner -> shoulder point, the gore's hem), 1 gore line
 *    (shoulder point -> gore start), 2 side (gore start -> corner)
 *  sleeve: 0 top edge (hem end -> armhole), 1 armhole (top -> bottom, shoulder notch half way),
 *    2 bottom edge (armhole -> hem end), 3 hem
 *  gusset: 0 top (right -> left), 1 left, 2 bottom, 3 right
 * The front's local +x (FreeSewing's right half) is the wearer's left.
 */
function buildParts(draft) {
  const parts = draft.parts[0], b = parts['jane.body'], P = b.points, mx = P.middle.x;
  const body = (neck) => {
    const nk = reversed(neck);   // neckLeft -> neck centre -> neckRight
    return [
      { type: 'move', to: pt(P.leftShoulder, mx) },
      { type: 'line', to: pt(P.neckLeft, mx) },
      ...nk.slice(1).map(op => (op.type === 'curve' ? { type: 'curve', cp1: pt(op.cp1, mx), cp2: pt(op.cp2, mx), to: pt(op.to, mx) } : { type: 'line', to: pt(op.to, mx) })),
      { type: 'line', to: pt(P.rightShoulder, mx) },
      { type: 'line', to: pt(P.gorestartRight, mx) },
      { type: 'line', to: pt(P.bottomRight, mx) },
      { type: 'line', to: pt(P.bottomLeft, mx) },
      { type: 'line', to: pt(P.gorestartLeft, mx) },
      { type: 'close' },
    ];
  };
  // the neckline paths run neckRight -> centre -> neckLeft
  addPart(draft, 'jane.bodyFront', body(b.paths.neckLineFront), 'jane.body');
  addPart(draft, 'jane.bodyBack', body(b.paths.necklineBack), 'jane.body');
  addPart(draft, 'jane.gore', [
    { type: 'move', to: pt(P.topLeft) }, { type: 'line', to: pt(P.leftShoulder) },
    { type: 'line', to: pt(P.gorestartLeft) }, { type: 'close' },
  ], 'jane.body');
  for (const k of ['sleeve', 'gusset']) {
    const p = parts[`jane.${k}`];
    addPart(draft, `jane.${k}3d`, p.paths[k].ops.filter(op => op.type !== 'close'), `jane.${k}`);
  }
  addPart(draft, 'jane.bodyRect', b.paths.body.ops, 'jane.body');
}

function sizes(draft) {
  const parts = draft.parts[0], P = parts['jane.body'].points, S = parts['jane.sleeve'].points, G = parts['jane.gusset'].points;
  const sw = S.sleeveBottomLeft.y / 10, L = S.sleeveRight.x / 10, g = G.gussetRight.x / 10;
  const goreLine = Math.hypot(P.leftShoulder.x - P.gorestartLeft.x, P.leftShoulder.y - P.gorestartLeft.y) / 10;
  return { sw, L, g, open: Math.min(0.9, (sw / 2 + g) / goreLine) };
}

export function spec(o, draft) {
  buildParts(draft);
  const { L, g, open } = sizes(draft);
  const gl = g / L;
  // the sleeves and their gussets (sewn the same way in the pattern and the drape)
  const sleeveSeams = (s) => {
    const sl = `sleeve_${s}`, gu = `gusset_${s}`;
    return [
      { a: [[sl, 0, false, 0, 1 - gl]], b: [[sl, 2, true, gl, 1]] },                               // sleeve seam
      { a: [[gu, 0]], b: [[sl, 0, true, 1 - gl, 1]] },                                             // gusset into the sleeve
      { a: [[gu, 1]], b: [[sl, 2, true, 0, gl]] },
    ];
  };
  if (!o.drape3d) {
    return {
      pieces: [
        { name: 'body', part: 'jane.bodyRect', fold: 0 },
        { name: 'sleeve_l', part: 'jane.sleeve3d' },
        { name: 'sleeve_r', part: 'jane.sleeve3d' },
        { name: 'gusset_l', part: 'jane.gusset3d' },
        { name: 'gusset_r', part: 'jane.gusset3d' },
      ],
      seams: [...sleeveSeams('l'), ...sleeveSeams('r')],
      labels: {},
    };
  }
  const seams = [];
  for (const s of ['l', 'r']) {
    const sl = `sleeve_${s}`, gu = `gusset_${s}`;
    // body side: the gore line (from the shoulder down) and the side below the corner (down)
    const line = (piece, f0, f1) => (s === 'l' ? [piece, 4, false, f0, f1] : [piece, 8, true, 1 - f1, 1 - f0]);
    const side = (piece) => (s === 'l' ? [piece, 5] : [piece, 7, true]);
    seams.push(
      { a: [line('body_front', open, 1)], b: [line('body_back', open, 1)] },                        // side seam above the gores
      { a: [side('body_front')], b: [[`gore_${s}f`, 2]] },                                         // gores into the side seams
      { a: [side('body_back')], b: [[`gore_${s}b`, 2]] },
      { a: [[`gore_${s}f`, 1]], b: [[`gore_${s}b`, 1]] },                                          // gore kite
      ...sleeveSeams(s),
      // sleeve + gusset into the armhole gap: shoulder notch -> down the front / back
      { a: [[sl, 1, true, 0, 0.5], [gu, 3, true]], b: [line('body_front', 0, open)] },
      { a: [[sl, 1, false, 0.5, 1], [gu, 2]], b: [line('body_back', 0, open)] },
    );
  }
  seams.push(
    { a: [['body_front', 0]], b: [['body_back', 0]] },    // the shoulder fold
    { a: [['body_front', 3]], b: [['body_back', 3]] },
  );
  return {
    pieces: [
      { name: 'body_front', part: 'jane.bodyFront', label: 'body' },
      { name: 'body_back', part: 'jane.bodyBack', mirror: true, label: 'body' },
      { name: 'gore_lf', part: 'jane.gore', label: 'body' },
      { name: 'gore_lb', part: 'jane.gore', mirror: true, label: 'body' },
      { name: 'gore_rf', part: 'jane.gore', mirror: true, label: 'body' },
      { name: 'gore_rb', part: 'jane.gore', label: 'body' },
      { name: 'sleeve_l', part: 'jane.sleeve3d', label: 'arm', follow: 6 },
      { name: 'sleeve_r', part: 'jane.sleeve3d', mirror: true, label: 'arm', follow: 6 },
      { name: 'gusset_l', part: 'jane.gusset3d', label: 'arm', follow: 6 },
      { name: 'gusset_r', part: 'jane.gusset3d', mirror: true, label: 'arm', follow: 6 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], P = parts['jane.body'].points;
  const C = bodyColumns(body, m), F = upperFrame(body, m);
  const Yw = m.height - m.head_l - m.waist_line;
  const box = torsoBox(body, Yw - m.hips_line, C.Yhps - m.armscye_depth);
  const halfWidth = (P.topRight.x - P.topLeft.x) / 20;
  const span = outlineSpan(pieceLoop(parts['jane.bodyFront']));
  const front = curtainMap(C, box, { side: 1, xSign: 1, halfWidth, span });
  const back = curtainMap(C, box, { side: -1, xSign: -1, halfWidth, span });
  const { sw } = sizes(draft);
  const cornerY = -P.gorestartLeft.y / 10;
  return (ps) => {
    if (ps.name === 'body_front') return front;
    if (ps.name === 'body_back') return back;
    if (ps.name.startsWith('gore')) {
      // a fin beside the side seam below the corner: the corner at the top, the hem below,
      // opening out sideways (the front gore leaning forward, the back one back)
      const sx = ps.name[5] === 'l' ? 1 : -1, sz = ps.name[6] === 'f' ? 1 : -1;
      const Pc = sx > 0 ? front(halfWidth, cornerY) : front(-halfWidth, cornerY);
      const [cx, cy, cz] = Pc;
      const a = 0.45;
      return (x, y) => {
        const out = Math.abs(x), down = y - cornerY;   // gore local: x from 0 (the side) outwards, the corner at y = cornerY
        return [cx + sx * (1.5 + out * Math.cos(a)), cy - down, cz + sz * (1 + out * Math.sin(a))];
      };
    }
    if (ps.name.startsWith('sleeve') || ps.name.startsWith('gusset')) {
      const sx = ps.name.endsWith('_l') ? 1 : -1, A = F.arms[sx];
      if (!A) return null;
      const { sw: w, g } = sizes(draft);
      // a tube around the arm from the shoulder joint down: xs along the arm (0 at the armhole),
      // th around it (0 on top)
      const tube = (xs, th) => {
        const t = A.root + 15 + xs;
        const r = Math.max(w / (2 * Math.PI), A.radius(Math.max(A.root, t)) + 1.5);
        const c = Math.cos(th), s = Math.sin(th);
        return A.at(t, r, [c * A.up[0] + s * A.fr[0], c * A.up[1] + s * A.fr[1], c * A.up[2] + s * A.fr[2]]);
      };
      // sleeve: local x along the arm, local y around it (the shoulder notch, y = -sw / 2, on
      // top; y = 0 and y = -sw underneath, the front half towards y = 0)
      if (ps.name.startsWith('sleeve')) return (x, y) => tube(Math.abs(x), 2 * Math.PI * (y + w / 2) / w);
      // gusset: a diamond under the arm, its corners V (local (0, 0)) at the end of the sleeve
      // seam, A (g, 0) and B (0, -g) at the armhole either side of the seam, D (g, -g) towards
      // the side seam of the body
      const dphi = Math.PI * g / w;
      return (x, y) => {
        const u = Math.abs(x) / g, v = -y / g;
        const xs = g * (1 - u) * (1 - v) - g * u * v;
        const ph = dphi * (u * (1 - v) - (1 - u) * v);
        return tube(xs, Math.PI - ph);
      };
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
