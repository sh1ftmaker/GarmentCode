// FreeSewing "Cathrin" corset (https://freesewing.eu/designs/cathrin/, MIT, design by Cathrin
// Åhlén and Joost De Cock): an underbust corset of 11 or 13 panels (6 or 7 a side, the
// centre front panel cut on the fold), laced at the centre back over a gap. Measurements from
// the mannequin, options as sliders, seam table and placement around the waist for the drape.
//
// Cathrin drafts its panels on one sheet side by side, from the centre front (x = 0) to the
// centre back, the waist on one line: the sheet's x is the distance around the body from the
// centre front. Each panel is laid on a ring around the torso at its height (the waist at
// the body's waist). The corset is the real pattern (it is smaller than the waist by the
// waist reduction): the lacing is not simulated, but the centre back edges are drawn towards
// the spine as the lacing pulls them (gentle one-sided limits, as GarmentCode's collar
// attachments), and the gap left between them is the lacing gap on this (rigid) body.
import { upperFrame, bandRingMap } from './place.js';
import { pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'cathrin';
export const name = 'Cathrin corset';
export const short = 'Corset';
export const exportName = 'Cathrin';
export const url = 'https://freesewing.eu/designs/cathrin/';
export const author = 'Cathrin Åhlén';
export const settings = { expand: true };
export const icon = 'M16 8c4 2 8 3 12 3s8-1 12-3c-3 8-4 14 0 20-4 6-3 14 0 20-4-2-8-3-12-3s-8 1-12 3c3-6 4-14 0-20 4-6 3-12 0-20zm12 3v34';
export const stretchNote = 'Cathrin is a corset: smaller than the waist by the waist reduction and laced closed at the back. The 3D body does not compress, so in the drape the corset sits around the waist as drafted, its centre back edges drawn towards the spine as the lacing would pull them, the lacing itself not simulated. The interfacing (every panel again) is cut, not simulated.';
export const others = { interfacing: ['Every panel, as cut from the fabric'] };

export const design = {
  fit: {
    waistReduction: { v: 10, range: [2, 20], type: 'float', name: 'Waist reduction (%)', help: 'The amount by which you want the corset to pinch your waist.' },
    panels: { v: '13', range: ['11', '13'], type: 'select', name: 'Number of panels', help: 'The number of panels to draft. More panels are better to fit a curvier model.' },
  },
  style: {
    backOpening: { v: 4, range: [3, 10], type: 'float', name: 'Back opening (%)', help: 'Opening at the centre back closure.' },
    backRise: { v: 15, range: [1, 25], type: 'float', name: 'Back rise (%)', help: 'How much the back panels rise from your arms to your centre back.' },
    backDrop: { v: 2, range: [-10, 5], type: 'float', name: 'Back drop (%)', help: 'How much the back panels lower from your hips towards your centre back.' },
    frontRise: { v: 4, range: [-10, 8], type: 'float', name: 'Front rise (%)', help: 'Rise of the front panels at the centre front, between your breasts.' },
    frontDrop: { v: 5, range: [0, 10], type: 'float', name: 'Front drop (%)', help: 'How much the front panels lower from your hips towards your centre front.' },
    hipRise: { v: 5, range: [0, 15], type: 'float', name: 'Hip rise (%)', help: 'How much the side panels rise on your hips.' },
  },
};

export const options = (d) => treeOptions(d, new Set(['panels']));
const MEASUREMENTS = ['underbust', 'waist', 'hips', 'waistToUnderbust', 'waistToHips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/**
 * Cathrin's panels: [{ key, part, path, fold }] in order from the centre front. Its parts draw
 * their outlines as paths named after the panel (panel1 holds both panel1a and panel1b with
 * 13 panels), not `seam`; each gets a part of its own whose seam path is that outline
 * (added to the draft, sharing everything else with the original part).
 */
function panels(parts) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const part = parts[`cathrin.panel${i}`];
    if (!part) continue;
    for (const k of i === 1 ? ['panel1a', 'panel1b', 'panel1'] : [`panel${i}`]) {
      if (!part.paths[k] || part.paths[k].hidden) continue;
      const key = `cathrin.${k}`;
      if (!parts[key] || parts[key].paths.seam !== part.paths[k]) parts[key] = Object.assign(Object.create(part), { name: key, paths: { ...part.paths, seam: part.paths[k] } });
      out.push({ key, src: `cathrin.panel${i}`, name: k.replace('panel', 'panel_'), fold: k === 'panel1a' || k === 'panel1' });
    }
  }
  return out;
}

/** A panel's outline: bottom (0), the side towards the back (going up), the top, the side towards the front (going down). */
function panelEdges(part) {
  const ed = pathEdges(part.paths.seam);
  const live = ed.map((p, k) => (p && Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) > 1e-3 ? k : -1)).filter(k => k >= 0);
  let i = 1;
  const up = [], down = [];
  const rises = (k) => { const a = ed[k][0], b = ed[k].at(-1); return b[1] - a[1] > Math.max(1, Math.abs(b[0] - a[0])); };
  while (i < live.length && rises(live[i])) up.push(live[i++]);
  const top = live[i++];
  while (i < live.length) down.push(live[i++]);
  return { bottom: live[0], back: up, top, front: down };
}

/*
 * Pieces (the sheet's original half is the wearer's left): panel_1a on the fold (13 panels)
 * or panel_1 (11), then left_/right_ copies of the others (panel_1b, panel_2 ... panel_6).
 * Seams: each panel's back side (up) to the next panel's front side (drawn down). The centre
 * back sides of panel_6 are the lacing edges, not sewn.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const P = panels(parts);
  const pieces = [], seams = [], lacing = { l: [], r: [] };
  for (const p of P) {
    if (p.fold) pieces.push({ name: p.name, part: p.key, fold: panelEdges(parts[p.key]).front[0], label: 'body' });
    else pieces.push({ name: `left_${p.name}`, part: p.key, label: 'body' }, { name: `right_${p.name}`, part: p.key, mirror: true, label: 'body' });
  }
  for (const s of ['left', 'right']) {
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], Ea = panelEdges(parts[a.key]), Eb = panelEdges(parts[b.key]);
      const pa = a.fold ? a.name : `${s}_${a.name}`, pb = `${s}_${b.name}`;
      const fa = (k) => (a.fold && s === 'right' ? 'm' + k : String(k));
      seams.push({ a: Ea.back.map(k => [pa, fa(k)]), b: Eb.front.slice().reverse().map(k => [pb, k, true]) });
    }
    const last = P.at(-1);
    lacing[s[0]].push(...panelEdges(parts[last.key]).back.map(k => [`${s}_${last.name}`, k]));
  }
  return { pieces, seams, labels: { lacing_l_collar: lacing.l, lacing_r_collar: lacing.r } };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const P = panels(parts);
  const F = upperFrame(body, m);
  // the sheet: the waist line's height, the centre back's x
  const wl = parts['cathrin.panel2'].paths.panel2Waist.ops[0].to.y / -10;
  const last = parts[P.at(-1).key], le = pathEdges(last.paths.seam);
  const cb = Math.max(...panelEdges(last).back.map(k => le[k][0][0]));
  return () => (x, y) => {
    const R = bandRingMap(F, { Y: F.Ywaist + (y - wl), len: 2 * cb, phi0: 0, dir: 1, gap: 1.2 });
    return R(x, 0);
  };
}

/** The centre back edges are held no further from the spine than half the designed opening. */
export function attachLevels(draft) {
  const o = draft.settings[0].options, ms = draft.settings[0].measurements;
  const g = Math.max(1, (o.backOpening ?? 0.04) * ms.underbust / 10);
  return { lacing_l_collar: g / 2, lacing_r_collar: -g / 2 };
}
export const lift = 0;
