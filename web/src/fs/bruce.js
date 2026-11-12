// FreeSewing "Bruce" boxer briefs (https://freesewing.eu/designs/bruce/, MIT) as an
// app design: measurements from the mannequin, options as sliders, seam table and
// placement around the hips for the drape.
import { measureGirth } from '../body.js';
import { hipSurface, bodySection, fitAffine } from './convert.js';

export const id = 'bruce';
export const name = 'Bruce boxer briefs';
export const short = 'Boxer briefs';
export const exportName = 'Bruce';               // class exported by the FreeSewing bundle
export const url = 'https://freesewing.eu/designs/bruce/';
export const icon = 'M8 10h40l-2 14c-1 9-5 16-11 20l-7-2-7 2c-6-4-10-11-11-20z';
export const stretchNote = 'Bruce is drafted with negative ease for stretch knits. The 3D drape uses a relaxed copy (no negative ease at the hips, a third of it at the legs) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern.';

// Options as an app parameter tree ({ v, range, type } like GarmentCode's design
// parameters). Percentages are shown as FreeSewing shows them.
export const design = {
  fit: {
    stretch: { v: 15, range: [5, 25], type: 'float', name: 'Fabric stretch (%)', help: 'How much the fabric stretches around the hips. More stretch drafts a smaller pattern.' },
    legStretch: { v: 40, range: [25, 45], type: 'float', name: 'Leg stretch (%)', help: 'Negative ease around the thigh.' },
    backRise: { v: 5, range: [0, 10], type: 'float', name: 'Back rise (%)', help: 'Raises the back waistline.' },
    bulge: { v: 20, range: [0, 40], type: 'float', name: 'Pouch bulge (°)', help: 'Shapes the front pouch.' },
  },
  style: {
    rise: { v: 10, range: [0, 25], type: 'float', name: 'Rise (%)', help: 'Raises the waistline above the hip line.' },
    legBonus: { v: 0, range: [-10, 20], type: 'float', name: 'Leg length (%)', help: 'Lengthens (or shortens) the legs.' },
  },
};
const DEG = new Set(['bulge']);

/** App design tree -> FreeSewing options (percent options as fractions). */
export function options(d, { relaxed = false } = {}) {
  const o = {};
  for (const grp of Object.values(d)) for (const [k, n] of Object.entries(grp)) o[k] = DEG.has(k) ? n.v : n.v / 100;
  // The simulated cloth barely stretches, so the drape uses a relaxed copy: no negative
  // ease around the hips and about a third of it around the legs (enough for the leg
  // openings to hug the thighs instead of flaring).
  if (relaxed) { o.stretch = 0; o.legStretch *= 0.35; }
  return o;
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // as gc_bridge's lower_interface

/**
 * GarmentCode measurements (cm) -> FreeSewing's (mm). FreeSewing's `hips` is the girth
 * at the top of the hip bone (between waist and seat), not GarmentCode's fullest-hip
 * `hips`, so it is measured on the mannequin about halfway down to the seat.
 */
export function measurements(m, body) {
  const waistToHips = 0.5 * m.hips_line;
  let hips = body ? measureGirth(body.pos, body.part, waistY(m) - waistToHips) : 0;
  if (!(hips > 0.6 * m.waist)) hips = 0.92 * m.hips;
  return {
    hips: hips * 10,
    upperLeg: m.leg_circ * 10,
    waistToHips: waistToHips * 10,
    waistToUpperLeg: (m.hips_line + m.crotch_hip_diff) * 10,
  };
}

/** How the parts are cut and sewn (edge numbers follow each part's seam path). */
export function spec(o) {
  const bulge = o.bulge > 0;
  // Front edges: 0 side (wearer's right), 1-2 waist, 3 side (left), 4 curve (left),
  // then with a bulge: 5 tusk, 6-7 pouch dart, 8 tusk, 9 curve; without: 5 crotch, 6 curve.
  const F = bulge ? { tuskL: [['front', 5, true]], tuskR: [['front', 8]], curveR: 9, dart: true }
                  : { tuskL: [['front', 5, true, 0, 0.5]], tuskR: [['front', 5, false, 0.5, 1]], curveR: 6, dart: false };
  return {
    pieces: [
      { name: 'front', part: 'bruce.front', lining: true },   // FreeSewing: cut 2 (double-layer pouch)
      { name: 'back', part: 'bruce.back', fold: 4 },               // cut on the fold: unfolded here
      { name: 'side_r', part: 'bruce.side' },
      { name: 'side_l', part: 'bruce.side', mirror: true },
      { name: 'inset_r', part: 'bruce.inset' },
      { name: 'inset_l', part: 'bruce.inset', mirror: true },
    ],
    seams: [
      // back to sides ('&')
      { a: [['back', 2]], b: [['side_r', 0]] },
      { a: [['back', 'm2']], b: [['side_l', 0]] },
      // sides to front + inset ('#'), top to bottom
      { a: [['side_r', 2]], b: [['front', 0, true], ['inset_r', 2]] },
      { a: [['side_l', 2]], b: [['front', 3], ['inset_l', 2]] },
      // front curves to insets ('~'), crotch to side
      { a: [['inset_r', 1]], b: [['front', F.curveR]] },
      { a: [['inset_l', 1, true]], b: [['front', 4]] },
      // gusset ('*'): back crotch to front tusk + inset, from the centre outwards
      { a: [['back', 0]], b: [...F.tuskR, ['inset_r', 0, true]] },
      { a: [['back', 'm0']], b: [...F.tuskL, ['inset_l', 0, true]] },
      // pouch dart
      ...(F.dart ? [{ a: [['front', 6, true]], b: [['front', 7]] }] : []),
    ],
    labels: {
      lower_interface: [['front', 1], ['front', 2], ['back', 3], ['back', 'm3'], ['side_r', 1], ['side_l', 1]],
    },
  };
}

/**
 * Placement for the drape. Pieces are laid on a hip-hugging surface: u runs along the
 * hip girth from centre front (the back is centred at u = girth/2), h is the height
 * above FreeSewing's hip line. Front, back and sides keep their drafted shape; the
 * insets are fitted to the points they are sewn to.
 */
export function placement(draft, m, body) {
  const st = draft.setStores[0];
  const cm = (k) => st.get(k) / 10;
  const C = cm('hips'), hb = cm('hipsBack'), hf = cm('hipsFront'), rise = cm('rise'), hFront = cm('heightFront');
  const hipY = waistY(m) - 0.5 * m.hips_line;
  const crotchH = -(0.5 * m.hips_line + m.crotch_hip_diff);
  const sec = (body && bodySection(body.pos, body.part, hipY)) || { zc: 1, a: m.hips / 6.1, b: m.hips / 8.4 };
  // ellipse with the body's proportions and the pattern's girth
  const per = Math.PI * (3 * (sec.a + sec.b) - Math.sqrt((3 * sec.a + sec.b) * (sec.a + 3 * sec.b)));
  const k = C / per;
  const S = hipSurface({ hipY, zc: sec.zc, a: sec.a * k, b: sec.b * k, crotchH, gap: 5 });

  const parts = draft.parts[0];
  const fp = parts['bruce.front'].points, ip = parts['bruce.inset'].points;
  const loc = (pt, hOff = 0) => [pt.x / 10, hOff - pt.y / 10];   // part point -> (u, h) offsets
  const uMid = -(hf / 2 + 0.05 * hFront);
  // inset (wearer's right): side seam on the side panel, tip on the front tusk,
  // crotch corner tucked under from the front
  const tip = loc(fp.leftTuskLeft, rise);
  const inset = fitAffine([
    [loc(ip.topLeft), [uMid, rise - hFront]],
    [loc(ip.bottomLeft), [uMid, rise - hFront + ip.bottomLeft.y / -10]],
    [loc(ip.tip), tip],
    [loc(ip.bottomRight), [tip[0] - 1.5, tip[1] - 6]],
  ]);
  const maps = {
    front: (x, y) => [x, y + rise],
    back: (x, y) => [C / 2 + x, y],
    side: (x, y) => [-C / 2 + hb / 2 + x, y],
    inset,
  };
  return (ps) => {
    const f = maps[ps.name.replace(/_[lr]$/, '')];
    if (ps.mirror) return (x, y) => { const [u, h] = f(-x, y); return S(-u, h); };
    return (x, y) => { const [u, h] = f(x, y); return S(u, h); };
  };
}

/** Attachment level of the waist edge: the front's designed height, not the GarmentCode waist. */
export function attachLevels(draft, m) {
  const st = draft.setStores[0];
  return { lower_interface: waistY(m) - 0.5 * m.hips_line + (st.get('rise') + st.get('frontRise')) / 10 };
}
