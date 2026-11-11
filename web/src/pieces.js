// Pattern pieces for cutting: seam allowance, notches, seam numbers, grainline, names.
// Input is the fine export from the Python bridge (gc.pieces): panel outlines in cm,
// edge vertex ranges and stitches.

const TOKENS = [
  [/ftorso/, 'front bodice'], [/btorso/, 'back bodice'], [/sleeve_f/, 'sleeve front'], [/sleeve_b/, 'sleeve back'],
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
  const CL = window.ClipperLib;
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

/** Build cut-ready pieces. */
export function buildPieces(data, { sa = 1.5 } = {}) {
  const pieces = data.panels.map((p) => {
    let sew = p.boundary.map(([x, y]) => [x, y]);
    let ranges = p.edge_ranges;
    if (signedArea(sew) < 0) {   // make counter-clockwise; remap edge ranges
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
      sew, cut, ranges, notches: [], seamLabels: [],
      grain: [[cx, minY + h * 0.2], [cx, maxY - h * 0.2]],
      bbox: [minX, minY, maxX, maxY], area: Math.abs(signedArea(sew)),
    };
  });
  const byId = Object.fromEntries(pieces.map(p => [p.id, p]));

  // notches + seam numbers at the middle of every stitched edge
  const seams = [];
  data.stitches.forEach((s, k) => {
    const A = byId[s.a], B = byId[s.b];
    if (!A || !B) return;
    const len = polyLen(A.sew, s.ia);
    seams.push({ n: k + 1, a: A, b: B, len });
    for (const [P, idxs] of [[A, s.ia], [B, s.ib]]) {
      const mid = pointAlong(P.sew, idxs, 0.5);
      if (!mid) continue;
      P.notches.push({ p: mid.p, n: mid.n, seam: k + 1 });
      P.seamLabels.push({ p: [mid.p[0] - mid.n[0] * 2.2, mid.p[1] - mid.n[1] * 2.2], seam: k + 1 });
    }
  });
  return { pieces, seams, sa };
}

function polyLen(pts, idxs) {
  let l = 0;
  for (let i = 1; i < idxs.length; i++) { const a = pts[idxs[i - 1]], b = pts[idxs[i]]; if (a && b) l += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return l;
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
    if (!groups.has(key)) groups.set(key, { x, y, nums: [], len: 0, cat: x.id === y.id ? -1 : Math.max(x.cat, y.cat) * 10 + Math.min(x.cat, y.cat) });
    const g = groups.get(key);
    g.nums.push(s.n); g.len += s.len;
  }
  const order = [...groups.values()].sort((a, b) => a.cat - b.cat || a.nums[0] - b.nums[0]);
  const steps = order.map(g => g.x.id === g.y.id
    ? `Sew the dart${g.nums.length > 2 ? 's' : ''} in <b>${g.x.name}</b> (seam${g.nums.length > 1 ? 's' : ''} ${g.nums.join(', ')}).`
    : `Sew <b>${g.x.name}</b> to <b>${g.y.name}</b>, matching seam${g.nums.length > 1 ? 's' : ''} ${g.nums.join(', ')} (${Math.round(g.len)} cm).`);
  steps.push('Finish the remaining raw edges (hems, neckline, armholes) with your preferred method.');
  return steps;
}
