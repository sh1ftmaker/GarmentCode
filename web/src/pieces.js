// Pattern pieces for cutting: seam allowance, notches, seam numbers, grainline, names.
// Input is the fine export from the Python bridge (gc.pieces): panel outlines in cm,
// edge vertex ranges and stitches.

const TOKENS = [
  [/ins_skirt_front/, 'godet front'], [/ins_skirt_back/, 'godet back'], [/ftorso/, 'front bodice'], [/btorso/, 'back bodice'], [/sleeve_f/, 'sleeve front'], [/sleeve_b/, 'sleeve back'],
  [/collar_front/, 'collar front'], [/collar_back/, 'collar back'], [/wb_front/, 'waistband front'],
  [/wb_back/, 'waistband back'], [/pant_f/, 'pants front'], [/pant_b/, 'pants back'], [/skirt_front/, 'skirt front'],
  [/skirt_back/, 'skirt back'], [/hood/, 'hood'], [/cuff/, 'cuff'], [/lapel/, 'lapel'], [/turtle/, 'turtleneck'],
];
export function pieceName(raw) {
  let s = raw.toLowerCase();
  let side = '';
  if (/^left_|_l$|_l_/.test(s)) side = 'left';
  if (/^right_|_r$|_r_/.test(s)) side = 'right';
  s = s.replace(/^(left|right)_/, '').replace(/_(l|r)$/, '');
  let name = null;
  for (const [re, n] of TOKENS) if (re.test(s)) { name = n; break; }
  if (!name) name = s.replace(/[_-]+/g, ' ');
  const level = raw.match(/(\d+)/);
  if (level && !/panel/.test(raw)) name += ` ${+level[1] + 1}`;
  if (/_lining$/.test(raw) && !/lining/.test(name)) name += ' lining';
  if (/panel_(\d+)/.test(raw)) name = `${name.replace(/panel \d+/, '').trim() || 'skirt'} panel ${+raw.match(/panel_(\d+)/)[1] + 1}`;
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return side ? `${name} (${side})` : name;
}

function category(raw) {
  if (/torso/.test(raw)) return 0;
  if (/collar|hood|lapel|turtle/.test(raw)) return 1;
  if (/sleeve|cuff/.test(raw) && !/pant/.test(raw)) return 2;
  if (/wb_/.test(raw)) return 3;
  if (/skirt|pant|godet|level/.test(raw)) return 4;
  return 5;
}

const signedArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

function offsetPolygon(pts, d) {
  const CL = globalThis.ClipperLib;
  if (!CL || d <= 0) return pts;
  const S = 1000;
  const co = new CL.ClipperOffset(2, 0.25 * S);
  co.AddPath(pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })), CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
  const sol = new CL.Paths();
  co.Execute(sol, d * S);
  if (!sol.length) return pts;
  let best = sol[0], bestA = 0;
  for (const p of sol) { const a = Math.abs(CL.Clipper.Area(p)); if (a > bestA) { bestA = a; best = p; } }
  return best.map(p => [p.X / S, p.Y / S]);
}

/** Rotate an arm panel by ±90° so that the end sewn to the bodice (the cap) is on top. */
function turnArm(sew, name, data) {
  const panels = Object.fromEntries(data.panels.map(q => [q.name, q]));
  const cap = [];
  for (const s of data.stitches) {
    for (const [me, other, idx] of [[s.a, s.b, s.ia], [s.b, s.a, s.ib]]) {
      if (me === name && panels[other] && panels[other].label !== 'arm') for (const i of idx) if (sew[i]) cap.push(sew[i]);
    }
  }
  const cx = sew.reduce((a, q) => a + q[0], 0) / sew.length;
  const capX = cap.length ? cap.reduce((a, q) => a + q[0], 0) / cap.length : null;
  // (x, y) -> (-y, x) puts +x on top; (y, -x) puts -x on top
  const capOnPlusX = capX != null ? capX > cx : true;
  return sew.map(([x, y]) => (capOnPlusX ? [-y, x] : [y, -x]));
}

/** Build cut-ready pieces. `note` (e.g. the main body measurements) is printed on each piece. */
export function buildPieces(data, { sa = 1.5, note = '' } = {}) {
  const pieces = data.panels.map((p) => {
    let sew = p.boundary.map(([x, y]) => [x, y]);
    // Grain runs along local y (the garment's vertical). GarmentCode draws sleeve panels
    // ('arm') lengthwise along local x, so turn them a quarter turn (rigidly) to put the
    // grain along the arm, sleeve cap up. FreeSewing parts (no 3D frame) already have it.
    const gcFrame = Array.isArray(p.rotation) && p.rotation[2] && p.rotation[2].some(v => v !== 0);
    if (p.label === 'arm' && gcFrame) sew = turnArm(sew, p.name, data);
    let ranges = p.edge_ranges;
    const reversed = signedArea(sew) < 0;
    if (reversed) {   // make counter-clockwise; remap edge ranges
      const n = sew.length;
      sew = sew.reverse();
      ranges = ranges.map(r => r.map(i => (n - 1 - i)));
    }
    const cut = offsetPolygon(sew, sa);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of cut) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, h = maxY - minY;
    return {
      id: p.name, raw: p.name, name: pieceName(p.name), cat: category(p.name),
      sew, cut, ranges, notches: [], seamLabels: [], reversed,
      grain: [[cx, minY + h * 0.2], [cx, maxY - h * 0.2]],
      bbox: [minX, minY, maxX, maxY], area: Math.abs(signedArea(sew)),
    };
  });
  const byId = Object.fromEntries(pieces.map(p => [p.id, p]));

  // notches + seam numbers on every stitched edge: one at the middle (two for seams that
  // involve a back piece, the usual front/back convention), and single extra notches at
  // the quarter points of long seams so eased or flared edges are matched evenly.
  const seams = [];
  data.stitches.forEach((s0, k) => {
    const A = byId[s0.a], B = byId[s0.b];
    if (!A || !B) return;
    // stitch vertex indices refer to the panel outline as exported; follow the reversal
    const fix = (P, idxs) => (P.reversed ? idxs.map(i => P.sew.length - 1 - i) : idxs);
    const s = { ...s0, ia: fix(A, s0.ia), ib: fix(B, s0.ib) };
    const len = polyLen(A.sew, s.ia);
    const lenB = polyLen(B.sew, s.ib);
    // within one piece: a dart when the two legs meet at a tip, else the piece is closed into a
    // tube or ring (a sleeve's underarm, a band's ends)
    const ends = [s.ia[0], s.ia[s.ia.length - 1]];
    const dart = A === B && (ends.includes(s.ib[0]) || ends.includes(s.ib[s.ib.length - 1]));
    seams.push({ n: k + 1, a: A, b: B, len, dart });
    const count = /back/i.test(A.name + B.name) ? 2 : 1;
    for (const [P, idxs, l] of [[A, s.ia, len], [B, s.ib, lenB]]) {
      const mid = outward(P.sew, pointAlong(P.sew, idxs, 0.5));
      if (!mid) continue;
      if (count === 2) {   // two notches 1 cm apart around the middle
        for (const d of [-0.5, 0.5]) { const q = outward(P.sew, pointAlong(P.sew, idxs, 0.5 + d / Math.max(l, 1))); if (q) P.notches.push({ p: q.p, n: q.n, seam: k + 1 }); }
      } else P.notches.push({ p: mid.p, n: mid.n, seam: k + 1 });
      if (Math.max(len, lenB) > 50) for (const t of [0.25, 0.75]) { const q = outward(P.sew, pointAlong(P.sew, idxs, t)); if (q) P.notches.push({ p: q.p, n: q.n, seam: k + 1 }); }
      P.seamLabels.push({ p: [mid.p[0] - mid.n[0] * 2.2, mid.p[1] - mid.n[1] * 2.2], seam: k + 1 });
    }
  });
  const groups = groupPieces(pieces);
  return { pieces, seams, sa, groups, note };
}

// ---------------------------------------------------------------- matching shapes
// GarmentCode emits left and right panels separately, and FreeSewing mirrored/lined copies
// are separate panels too. Pieces with the same outline (or its mirror image) are cut from
// one pattern piece: "Cut 2 (mirrored pair)". A piece that is its own mirror image can be
// cut on the fold. Only outlines are compared; nothing is changed.
const TOL = 0.25;   // cm
function norm(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { pts: pts.map(([x, y]) => [x - minX, y - minY]), w: maxX - minX, h: maxY - minY, minX, minY };
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function within(A, B, tol) {   // every point of A within tol of the outline B
  const step = Math.max(1, Math.floor(A.length / 120));
  for (let i = 0; i < A.length; i += step) {
    let d = Infinity;
    for (let j = 0; j < B.length && d > tol; j++) d = Math.min(d, segDist(A[i], B[j], B[(j + 1) % B.length]));
    if (d > tol) return false;
  }
  return true;
}
function sameShape(a, b, tol = TOL) { return Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol && within(a.pts, b.pts, tol) && within(b.pts, a.pts, tol); }
// grain-preserving moves of a normalised outline: [x, y] -> [x', y'] within its box
const MOVES = {
  same: (s, [x, y]) => [x, y],
  r180: (s, [x, y]) => [s.w - x, s.h - y],
  mirror: (s, [x, y]) => [s.w - x, y],
  mirrorV: (s, [x, y]) => [x, s.h - y],
};
const moved = (s, k) => ({ ...s, pts: s.pts.map(q => MOVES[k](s, q)) });
/** How piece b relates to piece a: 'same' | 'r180' | 'mirror' | 'mirrorV' | null. */
export function relation(a, b) {
  const A = norm(a.sew), B = norm(b.sew);
  if (Math.abs(A.w - B.w) > TOL || Math.abs(A.h - B.h) > TOL || Math.abs(a.area - b.area) > 0.01 * a.area + 1) return null;
  for (const k of ['same', 'r180', 'mirror', 'mirrorV']) if (sameShape(moved(A, k), B)) return k;
  return null;
}
const isFlip = (rel) => rel === 'mirror' || rel === 'mirrorV';
const baseName = (name) => name.replace(/\s*\((left|right)\)$/, '');
/** "Skirt panel 1", "Skirt panel 2", "Skirt panel 3" -> "Skirt panel 1–3". */
function groupName(names) {
  const stems = new Map();
  for (const n of names) {
    const m = n.match(/^(.*?)\s+(\d+)$/);
    const [stem, num] = m ? [m[1], +m[2]] : [n, null];
    if (!stems.has(stem)) stems.set(stem, []);
    if (num != null) stems.get(stem).push(num);
  }
  return [...stems].map(([stem, nums]) => {
    if (!nums.length) return stem;
    nums = [...new Set(nums)].sort((a, b) => a - b);
    const run = nums.length > 2 && nums[nums.length - 1] - nums[0] === nums.length - 1;
    return `${stem} ${run ? `${nums[0]}–${nums[nums.length - 1]}` : nums.join(', ')}`;
  }).join(' + ');
}
/** A point of piece `from` (related to `rep` by `rel`) in the frame of `rep`. */
function toRep(rep, from, rel, [x, y]) {
  const R = norm(rep.sew), F = norm(from.sew);
  // rel maps rep -> from; all four moves are their own inverse
  const [u, v] = MOVES[rel](F, [x - F.minX, y - F.minY]);
  return [u + R.minX, v + R.minY];
}
function groupPieces(pieces) {
  const byId = Object.fromEntries(pieces.map(p => [p.id, p]));
  for (const p of pieces) { const s = norm(p.sew); p.sym = sameShape(s, moved(s, 'mirror')); }
  const groups = [];
  for (const p of pieces) {
    let hit = null;
    for (const g of groups) {
      const rep = byId[g.members[0].id];
      if (rep.sym !== p.sym) continue;
      const rel = relation(rep, p);
      if (rel) { hit = g; g.members.push({ id: p.id, rel }); break; }
    }
    if (!hit) groups.push({ id: p.id, members: [{ id: p.id, rel: 'same' }], sym: p.sym });
  }
  for (const g of groups) {
    // show the left piece of a pair on the pattern sheet when there is one
    const li = g.members.findIndex(m => /\(left\)$/.test(byId[m.id].name));
    if (li > 0) {
      const rep = byId[g.members[li].id];
      g.members = [g.members[li], ...g.members.filter((_, i) => i !== li)].map(m => ({ id: m.id, rel: relation(rep, byId[m.id]) || 'same' }));
    }
    for (const m of g.members) m.flip = !g.sym && isFlip(m.rel);
    const ms = g.members.map(m => byId[m.id]);
    g.name = groupName(ms.map(q => baseName(q.name)));
    g.count = g.members.length;
    g.mirrored = g.members.filter(m => m.flip).length;
    for (const m of g.members) { byId[m.id].group = g.id; byId[m.id].flip = m.flip; }
    // seam numbers of every member at the representative's notches ("3/7" on a left/right pair)
    const rep = ms[0];
    g.seamLabels = rep.seamLabels.map(s => ({ p: s.p, seams: [s.seam] }));
    for (let k = 1; k < ms.length; k++) for (const s of ms[k].seamLabels) {
      const q = toRep(rep, ms[k], g.members[k].rel, s.p);
      let best = null, bd = 2.5;
      for (const t of g.seamLabels) { const d = Math.hypot(t.p[0] - q[0], t.p[1] - q[1]); if (d < bd) { bd = d; best = t; } }
      if (best) { if (!best.seams.includes(s.seam)) best.seams.push(s.seam); }
      else g.seamLabels.push({ p: q, seams: [s.seam] });
    }
  }
  return groups;
}

/** Plain cut instruction for a group, e.g. "Cut 2 (mirrored pair)" or "Cut 1 on fold". */
export function cutText(g, { folded = false } = {}) {
  const n = g.count, m = g.mirrored;
  if (g.sym && n === 1) return folded ? 'Cut 1 on fold' : 'Cut 1';
  if (g.sym) return `Cut ${n}`;
  if (n === 1) return 'Cut 1';
  if (m === 0) return `Cut ${n}, same side up`;
  if (n === 2 && m === 1) return 'Cut 2 (mirrored pair)';
  return `Cut ${n}: ${n - m} + ${m} mirrored`;
}

function polyLen(pts, idxs) {
  let l = 0;
  for (let i = 1; i < idxs.length; i++) { const a = pts[idxs[i - 1]], b = pts[idxs[i]]; if (a && b) l += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return l;
}
function insidePoly(x, y, pts) {
  let o = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) o = !o;
  }
  return o;
}
// the edge normal of a point found by pointAlong, turned to point out of the piece
function outward(pts, q) {
  if (!q) return q;
  if (insidePoly(q.p[0] + q.n[0] * 0.3, q.p[1] + q.n[1] * 0.3, pts)) q.n = [-q.n[0], -q.n[1]];
  return q;
}
function pointAlong(pts, idxs, t) {
  const total = polyLen(pts, idxs);
  if (!total) return null;
  let acc = 0;
  for (let i = 1; i < idxs.length; i++) {
    const a = pts[idxs[i - 1]], b = pts[idxs[i]];
    if (!a || !b) continue;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= t * total && l > 0) {
      const u = (t * total - acc) / l;
      const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], n: [ty, -tx] };  // outward for CCW
    }
    acc += l;
  }
  return null;
}

/** Plain-language sewing order generated from GarmentCode's stitch list. */
export function sewingSteps({ seams }) {
  const groups = new Map();
  for (const s of seams) {
    const [x, y] = s.a.cat <= s.b.cat ? [s.a, s.b] : [s.b, s.a];
    if (x.id === y.id) { x.dartCat = true; }
    const key = `${x.id}|${y.id}`;
    // darts first, then seams by garment region
    if (!groups.has(key)) groups.set(key, { x, y, nums: [], len: 0, dart: !!s.dart, cat: x.id === y.id ? -1 : Math.max(x.cat, y.cat) * 10 + Math.min(x.cat, y.cat) });
    const g = groups.get(key);
    g.dart = g.dart && !!s.dart;
    g.nums.push(s.n); g.len += s.len;
  }
  const order = [...groups.values()].sort((a, b) => a.cat - b.cat || a.nums[0] - b.nums[0]);
  const steps = order.map(g => g.x.id === g.y.id && !g.dart
    ? `Close <b>${g.x.name}</b> into a tube or ring (seam${g.nums.length > 1 ? 's' : ''} ${g.nums.join(', ')}, ${Math.round(g.len)} cm).`
    : g.x.id === g.y.id
    ? `Sew the dart${g.nums.length > 2 ? 's' : ''} in <b>${g.x.name}</b> (seam${g.nums.length > 1 ? 's' : ''} ${g.nums.join(', ')}).`
    : `Sew <b>${g.x.name}</b> to <b>${g.y.name}</b>, matching seam${g.nums.length > 1 ? 's' : ''} ${g.nums.join(', ')} (${Math.round(g.len)} cm).`);
  steps.push('Finish the remaining raw edges (hems, neckline, armholes) with your preferred method.');
  return steps;
}
