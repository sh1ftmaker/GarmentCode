// Placement for loose, mostly rectangular garments that hang from the shoulders (tunics,
// shifts, cloaks): Tiberius, Jane, Lunetius. The front (or back) of the garment hangs like a
// curtain: from the top of the shoulders (and of the arms, beyond the shoulder point) over
// the front of the body, then straight down, never inside the body or the arms. Across the
// body the piece follows a half ellipse around the torso so that front and back side seams
// meet at its ends.
//
// Conventions as in place.js: world cm, y up, the body faces +z, the wearer's left is +x.
import { PART } from '../body.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Columns of the mannequin (torso and arms) seen from the front, per 1 cm of lateral
 * offset |X| and 2 cm of height: the top of each column (the neck cut off at the high
 * shoulder point), and how far the body reaches forward / back at or above a height.
 */
export function bodyColumns(body, m, { maxX = 90 } = {}) {
  const { pos, part } = body;
  const Yhps = m.height - m.head_l;
  const NX = maxX + 1, NY = Math.ceil(Yhps / 2) + 3;
  const top = new Float32Array(NX).fill(-Infinity), zs = new Float32Array(NX), zn = new Float32Array(NX);
  const zmax = new Float32Array(NX * NY).fill(-Infinity), zmin = new Float32Array(NX * NY).fill(Infinity);
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_ARM && p !== PART.R_ARM) continue;
    const y = pos[3 * v + 1], z = pos[3 * v + 2];
    if (y > Yhps + 1) continue;
    const X = Math.abs(pos[3 * v]);
    for (let k = Math.max(0, Math.floor(X - 1)); k <= Math.min(NX - 1, Math.ceil(X + 1)); k++) {
      top[k] = Math.max(top[k], y);
      const j = clamp(Math.round(y / 2), 0, NY - 1);
      zmax[k * NY + j] = Math.max(zmax[k * NY + j], z); zmin[k * NY + j] = Math.min(zmin[k * NY + j], z);
    }
  }
  // the z of each column's top: mean z of the vertices within 1.5 cm of it
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_ARM && p !== PART.R_ARM) continue;
    const y = pos[3 * v + 1], k = Math.round(Math.abs(pos[3 * v]));
    if (k >= NX || y > Yhps + 1 || y < top[k] - 1.5) continue;
    zs[k] += pos[3 * v + 2]; zn[k]++;
  }
  let lastX = 0;
  for (let k = 0; k < NX; k++) if (isFinite(top[k])) lastX = k;
  const topZ = new Float32Array(NX);
  for (let k = 0; k < NX; k++) topZ[k] = zn[k] ? zs[k] / zn[k] : (k ? topZ[k - 1] : 0);
  const xn = Math.max(2, Math.round(m.neck_w / 2 + 1));
  for (let k = 0; k < xn; k++) topZ[k] = topZ[xn];
  // curtains: the most forward (backward) the body reaches at this height or above
  const cf = new Float32Array(NX * NY), cb = new Float32Array(NX * NY);
  for (let k = 0; k < NX; k++) {
    let f = -Infinity, b = Infinity;
    for (let j = NY - 1; j >= 0; j--) {
      f = Math.max(f, zmax[k * NY + j]); b = Math.min(b, zmin[k * NY + j]);
      cf[k * NY + j] = f; cb[k * NY + j] = b;
    }
  }
  const sm = (A) => { const B = Float32Array.from(A); for (let k = 1; k < A.length - 1; k++) B[k] = (A[k - 1] + 2 * A[k] + A[k + 1]) / 4; return B; };
  const filled = Float32Array.from(top);   // columns without any body: carry the last top on
  for (let k = 0; k < NX; k++) if (!isFinite(filled[k])) filled[k] = k ? filled[k - 1] : Yhps;
  const T = sm(filled), TZ = sm(topZ);
  const at = (A, X) => { const x = clamp(Math.abs(X), 0, NX - 1.001), i = Math.floor(x), f = x - i; return A[i] * (1 - f) + A[i + 1] * f; };
  const grid = (G, X, Y, def) => {
    const k = clamp(Math.round(Math.abs(X)), 0, NX - 1), j = clamp(Math.round(Y / 2), 0, NY - 1);
    const v = G[k * NY + j];
    return isFinite(v) ? v : def;
  };
  return {
    Yhps, lastX,
    top: (X) => (Math.abs(X) > lastX ? -Infinity : at(T, X)),
    topZ: (X) => at(TZ, X),
    front: (X, Y) => grid(cf, X, Y, -Infinity),
    back: (X, Y) => grid(cb, X, Y, Infinity),
  };
}

/** Half ellipse around (0, zc) from x = -A to A through z = zc + B (front) or zc - B (back), by arc length. */
function halfEllipse(A, B, zc, side) {
  const N = 240, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = -Math.PI / 2 + Math.PI * i / N;
    pts.push([A * Math.sin(t), zc + side * B * Math.cos(t)]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const L = cum[N];
  return (f) => {   // f in 0..1 along the arc, from -A to A; beyond the ends straight on outwards
    if (f < 0) return [-A + f * L, zc];
    if (f > 1) return [A + (f - 1) * L, zc];
    const s = f * L;
    let i = 1;
    while (i < N && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
  };
}

/** Torso half width, centre z and front / back reach between two heights (torso only). */
export function torsoBox(body, y0, y1) {
  const { pos, part } = body;
  let xm = 0, z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== PART.BODY) continue;
    const y = pos[3 * v + 1];
    if (y < y0 || y > y1) continue;
    xm = Math.max(xm, Math.abs(pos[3 * v])); z0 = Math.min(z0, pos[3 * v + 2]); z1 = Math.max(z1, pos[3 * v + 2]);
  }
  return { halfW: xm, zc: (z0 + z1) / 2, depth: (z1 - z0) / 2 };
}

/**
 * A piece hanging from the shoulders like a curtain, on the front (side +1) or back (-1).
 *  C: bodyColumns(); box: torsoBox() of the trunk the piece hangs around;
 *  halfWidth: half the piece's width (local x from -halfWidth to halfWidth, 0 = centre);
 *  topY(x): local y of the piece's top edge at x (the shoulder line), default 0;
 *  xSign: world x sign of local +x.
 * Across, local x runs along a half ellipse around the trunk whose ends (the side seams)
 * the front and back share (beyond them, straight on out sideways, e.g. over an arm); with
 * `span` (an outlineSpan) each row of a piece that is not a rectangle has its own ellipse,
 * from side seam to side seam. Down from the top edge, the piece first runs over the top of
 * the shoulder (or arm) and then hangs down in front of (behind) everything above it.
 */
export function curtainMap(C, box, { side, halfWidth, topY = () => 0, xSign = 1, gap = 1.5, A = null, span = null }) {
  // depth of the ellipse so its half perimeter is the piece's width (at least the body's reach)
  const ellipse = (hw) => {
    const Aw = A ?? clamp(0.8 * hw, Math.min(hw, box.halfW + 3), hw);
    const per = (B) => Math.PI * Math.sqrt((Aw * Aw + B * B) / 2);
    let B = box.depth + gap;
    while (per(B) < 2 * hw && B < 80) B += 0.25;
    return halfEllipse(Aw, B, box.zc, side);
  };
  // span (outlineSpan of a piece that is not a rectangle): every row of the piece goes
  // around its own ellipse, from side seam to side seam
  const rows = new Map();
  const ringAt = (x, y) => {
    if (!span) return (rows.get(0) || rows.set(0, ellipse(halfWidth)).get(0))((xSign * x + halfWidth) / (2 * halfWidth));
    const yy = clamp(y, span.y0, span.y1), key = Math.round(yy * 2);
    const r = span(key / 2) || span(yy) || [-halfWidth, halfWidth];
    const hw = Math.max(1, (r[1] - r[0]) / 2), c = (r[0] + r[1]) / 2;
    if (!rows.has(key)) rows.set(key, ellipse(hw));
    return rows.get(key)((xSign * (x - c) + hw) / (2 * hw));
  };
  return (x, y) => {
    const [X, Ze] = ringAt(x, y);
    const d = Math.max(0, topY(x) - y);   // cm below the top edge
    let Yt = C.top(X);
    if (!isFinite(Yt)) Yt = C.top(C.lastX) - (Math.abs(X) - C.lastX);   // beyond the hands
    Yt += gap;
    const Zr = C.topZ(X);
    // the wall the piece hangs at, a little below the top
    const wall = (Y) => (side > 0 ? Math.max(Ze, C.front(X, Y) + gap) : Math.min(Ze, C.back(X, Y) - gap));
    const Zw = wall(Yt - 14);
    const hz = Math.max(1, Math.abs(Zw - Zr)), ry = clamp(0.9 * hz, 3, 10);
    // a quarter ellipse over the top, then down
    const arc = 0.5 * Math.PI * Math.sqrt((hz * hz + ry * ry) / 2);
    if (d < arc) {
      const t = (d / arc) * Math.PI / 2;
      return [X, Yt - ry + ry * Math.cos(t), Zr + side * hz * Math.sin(t)];
    }
    const Y = Yt - ry - (d - arc);
    const Zl = wall(Y);
    return [X, Y, side > 0 ? Math.max(Zw, Zl) : Math.min(Zw, Zl)];
  };
}
