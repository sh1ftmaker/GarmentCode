// Measurement-driven mannequin morph.
//
// Deforms one of GarmentCode's base bodies so that its main measurements follow the
// GarmentCode body parameters (height, landmark lines, bust/underbust/waist/hips girths and
// their back widths, shoulder width and slope, armhole depth, bust/seat point distances, arm
// length, wrist, thigh, neck). Regions come from GarmentCode's body
// segmentation (assets/bodies/ggg_body_segmentation.json) and are blended smoothly.
// This is an approximation for visualisation and draping, not a statistical body model.

export const PART = { BODY: 0, L_ARM: 1, R_ARM: 2, L_LEG: 3, R_LEG: 4, FACE: 5 };

/** Parse body_<name>.bin as written by tools/prepare_bodies.mjs */
export function parseBodyBin(buf) {
  const [nv, nf] = new Uint32Array(buf, 0, 2);
  const pos = new Float32Array(buf.slice(8, 8 + nv * 12));
  const idx = new Uint32Array(buf.slice(8 + nv * 12, 8 + nv * 12 + nf * 12));
  const partStart = 8 + nv * 12 + nf * 12;
  const part = buf.byteLength >= partStart + nv ? new Uint8Array(buf.slice(partStart, partStart + nv)) : new Uint8Array(nv);
  return { nv, nf, pos, idx, part };
}

// GarmentCode landmark heights (see assets/bodies/body_params.py)
function landmarks(m) {
  const neck = m.height - m.head_l;
  const bustLine = 'vert_bust_line' in m ? (2 / 3) * m.vert_bust_line + (1 / 3) * m.bust_line : m.bust_line;
  const waist = neck - m.waist_line;
  return {
    top: m.height, neck,
    armpit: neck - m.armscye_depth,
    bust: neck - bustLine,
    underbust: neck - bustLine - 0.35 * (m.waist_line - bustLine),
    waist,
    hips: waist - m.hips_line,
    crotch: waist - m.hips_line - Math.max(4, m.crotch_hip_diff || 8),
  };
}

function piecewise(xs, ys, x) {
  if (x <= xs[0]) return ys[0] + (x - xs[0]) * ((ys[1] - ys[0]) / (xs[1] - xs[0] || 1));
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
  }
  const n = xs.length - 1;
  return ys[n] + (x - xs[n]) * ((ys[n] - ys[n - 1]) / (xs[n] - xs[n - 1] || 1));
}

// Monotone cubic (PCHIP) through the control points: C1 smooth, so the girth / height
// profiles have no slope kinks that show up as shading bands. Outside the range it is held
// constant (clampEnds) or continued linearly like piecewise().
function smoothCurve(xs, ys, x, clampEnds) {
  const n = xs.length;
  if (x <= xs[0] || x >= xs[n - 1]) return clampEnds ? (x <= xs[0] ? ys[0] : ys[n - 1]) : piecewise(xs, ys, x);
  let i = 1;
  while (x > xs[i]) i++;
  const h = xs[i] - xs[i - 1];
  if (!(h > 1e-6)) return ys[i];
  const sec = (j) => (j < 1 || j >= n) ? NaN : (ys[j] - ys[j - 1]) / ((xs[j] - xs[j - 1]) || 1e-6);
  const slope = (j) => {  // Fritsch-Carlson tangent at control point j
    const a = sec(j), b = sec(j + 1);
    if (Number.isNaN(a)) return clampEnds ? 0 : b;
    if (Number.isNaN(b)) return clampEnds ? 0 : a;
    if (a * b <= 0) return 0;
    const ha = xs[j] - xs[j - 1], hb = xs[j + 1] - xs[j];
    return 3 * (ha + hb) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  };
  const t = (x - xs[i - 1]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i - 1] + (t3 - 2 * t2 + t) * h * slope(i - 1)
    + (-2 * t3 + 3 * t2) * ys[i] + (t3 - t2) * h * slope(i);
}
const piecewiseC = (xs, ys, x) => smoothCurve(xs, ys, x, true);

/** Precompute everything that depends only on the base body. */
export function prepareMorph(base) {
  const { nv, pos, idx, part } = base;
  // vertex adjacency for smoothing region weights
  const nbr = Array.from({ length: nv }, () => []);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    nbr[a].push(b, c); nbr[b].push(a, c); nbr[c].push(a, b);
  }
  // soft region weights: [body, arms, legs] smoothed over the mesh so seams blend
  const regionOf = (p) => (p === PART.L_ARM || p === PART.R_ARM) ? 1 : (p === PART.L_LEG || p === PART.R_LEG) ? 2 : 0;
  let W = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) W[3 * v + regionOf(part[v])] = 1;
  for (let it = 0; it < 12; it++) {
    const N = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      const ns = nbr[v];
      let a = W[3 * v], b = W[3 * v + 1], c = W[3 * v + 2];
      for (const u of ns) { a += W[3 * u]; b += W[3 * u + 1]; c += W[3 * u + 2]; }
      const k = 1 / (ns.length + 1);
      N[3 * v] = a * k; N[3 * v + 1] = b * k; N[3 * v + 2] = c * k;
    }
    W = N;
  }
  // torso centre per 1 cm slice (body vertices only), legs per side
  const slices = (filter) => {
    const sx = new Float64Array(220), sz = new Float64Array(220), n = new Float64Array(220);
    for (let v = 0; v < nv; v++) {
      if (!filter(part[v])) continue;
      const k = Math.max(0, Math.min(219, Math.round(pos[3 * v + 1])));
      sx[k] += pos[3 * v]; sz[k] += pos[3 * v + 2]; n[k]++;
    }
    const cx = new Float32Array(220), cz = new Float32Array(220);
    let lx = 0, lz = 0;
    for (let k = 0; k < 220; k++) { if (n[k]) { lx = sx[k] / n[k]; lz = sz[k] / n[k]; } cx[k] = lx; cz[k] = lz; }
    for (let k = 218; k >= 0; k--) if (!n[k] && n[k + 1]) { cx[k] = cx[k + 1]; cz[k] = cz[k + 1]; }
    // smooth (+-6 cm box filter, 3 passes) so the radial scaling has no slice-to-slice steps
    for (let pass = 0; pass < 3; pass++) {
      const ax = new Float32Array(cx), az = new Float32Array(cz);
      for (let k = 0; k < 220; k++) {
        let x = 0, z = 0, c = 0;
        for (let j = Math.max(0, k - 6); j <= Math.min(219, k + 6); j++) { x += ax[j]; z += az[j]; c++; }
        cx[k] = x / c; cz[k] = z / c;
      }
    }
    return { cx, cz };
  };
  const torso = slices(p => p === PART.BODY || p === PART.FACE);
  const legL = slices(p => p === PART.L_LEG), legR = slices(p => p === PART.R_LEG);
  // arm joints (arm vertices next to the body) and wrist ends
  const arm = {};
  for (const [key, pid] of [['L', PART.L_ARM], ['R', PART.R_ARM]]) {
    let jx = 0, jy = 0, jz = 0, jn = 0, far = -1, fv = 0;
    for (let v = 0; v < nv; v++) {
      if (part[v] !== pid) continue;
      if (nbr[v].some(u => part[u] === PART.BODY)) { jx += pos[3 * v]; jy += pos[3 * v + 1]; jz += pos[3 * v + 2]; jn++; }
    }
    const J = [jx / jn, jy / jn, jz / jn];
    for (let v = 0; v < nv; v++) {
      if (part[v] !== pid) continue;
      const d = Math.hypot(pos[3 * v] - J[0], pos[3 * v + 1] - J[1], pos[3 * v + 2] - J[2]);
      if (d > far) { far = d; fv = v; }
    }
    const tip = [pos[3 * fv], pos[3 * fv + 1], pos[3 * fv + 2]];
    const len = Math.hypot(tip[0] - J[0], tip[1] - J[1], tip[2] - J[2]);
    // shoulder tip / underarm: highest / lowest arm vertex on the arm / body seam
    let top = -1, low = -1;
    for (let v = 0; v < nv; v++) {
      if (part[v] !== pid || !nbr[v].some(u => part[u] === PART.BODY)) continue;
      if (top < 0 || pos[3 * v + 1] > pos[3 * top + 1]) top = v;
      if (low < 0 || pos[3 * v + 1] < pos[3 * low + 1]) low = v;
    }
    arm[key] = { J, dir: [(tip[0] - J[0]) / len, (tip[1] - J[1]) / len, (tip[2] - J[2]) / len], len, pid,
      tip: top >= 0 ? top : null, underarmY: low >= 0 ? pos[3 * low + 1] : NaN };
  }
  // Height of the fullest part of the seat (most posterior torso/leg point between thigh
  // and waist). GarmentCode's hips line (waist - hips_line) sits a few cm below it on
  // these meshes, so the hip girth control point is anchored here instead.
  let ymax = 0;
  for (let v = 0; v < nv; v++) ymax = Math.max(ymax, pos[3 * v + 1]);
  let zmin = Infinity;
  const seat = (v) => { const p = part[v], y = pos[3 * v + 1]; return (p === PART.BODY || p === PART.L_LEG || p === PART.R_LEG) && y > 0.45 * ymax && y < 0.6 * ymax; };
  for (let v = 0; v < nv; v++) if (seat(v)) zmin = Math.min(zmin, pos[3 * v + 2]);
  let sy = 0, sn = 0;
  for (let v = 0; v < nv; v++) if (seat(v) && pos[3 * v + 2] < zmin + 0.3) { sy += pos[3 * v + 1]; sn++; }
  const seatY = sn ? sy / sn : NaN;
  // torso + leg vertices bucketed per 1 cm of height (for the girth calibration)
  const bands = Array.from({ length: 220 }, () => []);
  for (let v = 0; v < nv; v++) {
    const p = part[v];
    if (p === PART.BODY || p === PART.L_LEG || p === PART.R_LEG) bands[clamp(Math.round(pos[3 * v + 1]), 0, 219)].push(v);
  }
  return { base, W, torso, legL, legR, arm, seatY, bands };
}

const smooth01 = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Morph the base body from measurements m0 (its own) to m1. Returns new positions (cm). */
export function morphBody(prep, m0, m1) {
  const { base, W, torso, legL, legR, arm } = prep;
  const { nv, pos, part } = base;
  const L0 = landmarks(m0), L1 = landmarks(m1);
  const r = (k) => (m1[k] && m0[k]) ? m1[k] / m0[k] : 1;
  const slice = (s, y) => {
    const f = Math.max(0, Math.min(218.999, y)), k = Math.floor(f), t = f - k;
    return [s.cx[k] + (s.cx[k + 1] - s.cx[k]) * t, s.cz[k] + (s.cz[k + 1] - s.cz[k]) * t];
  };

  // hip control point: the seat height of the base mesh, carried along with the hips line
  const hipOff = Number.isFinite(prep.seatY) ? clamp(prep.seatY - L0.hips, 0, 0.5 * m0.hips_line) : 0;
  const H0 = L0.hips + hipOff;
  const H1 = clamp(L1.hips + hipOff * (L1.waist - L1.crotch) / (L0.waist - L0.crotch), L1.crotch + 1, L1.waist - 1);

  // underarm control point: the bottom of the arm seam, which sits a few cm below
  // GarmentCode's armpit line (neck - armscye_depth) on these meshes
  const uy = (arm.L.underarmY + arm.R.underarmY) / 2;
  const armOff = Number.isFinite(uy) ? clamp(L0.armpit - uy, 0, 0.6 * (L0.armpit - L0.bust)) : 0;
  const A0 = L0.armpit - armOff, A1 = Math.max(L1.armpit - armOff, L1.bust + 0.25 * (L0.armpit - armOff - L0.bust));

  // vertical map through the landmark lines
  const ys0 = [0, L0.crotch, H0, L0.waist, L0.bust, A0, L0.neck, L0.top];
  const ys1 = [0, L1.crotch, H1, L1.waist, L1.bust, A1, L1.neck, L1.top];
  // keep the target landmark lines in order even for contradictory measurements (no folds)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < ys1.length; i++) ys1[i] = Math.max(ys1[i], ys1[i - 1] + 0.25 * (ys0[i] - ys0[i - 1]));
    for (let i = ys1.length - 2; i > 0; i--) ys1[i] = Math.min(ys1[i], ys1[i + 1] - 0.25 * (ys0[i + 1] - ys0[i]));
  }
  const mapY = (y) => smoothCurve(ys0, ys1, y, false);
  // torso girth factor along the base height
  const gys = [L0.crotch - 6, H0, L0.waist, L0.underbust, L0.bust, L0.armpit, L0.neck + 1, L0.neck + 5];
  const gvs = [r('hips') * 0.9 + 0.1, r('hips'), r('waist'), r('underbust'), r('bust'), r('bust'), r('neck_w'), 1];
  const girth = (y) => piecewiseC(gys, gvs, y);
  // back / front split of the girth: the back arc (side line to side line) follows the back
  // widths and the front gets the rest, so the full girth stays on target. The width (x) is
  // shared by both halves so the side line stays continuous; only the depths of the back
  // (z < centre) and the front differ, calibrated below on the actual mesh slices.
  const backFrac = (back, g) => {
    // the back share may move by at most 0.1 of the girth: contradictory inputs (e.g. a much
    // smaller waist with an unchanged back waist width) would otherwise flatten the front
    const b0 = m0[back] / m0[g], b1 = clamp((m1[back] ?? m0[back]) / (m1[g] ?? m0[g]), b0 - 0.1, b0 + 0.1);
    return b0 > 0 && b0 < 1 && b1 > 0 && b1 < 1 ? [b1 / b0, (1 - b1) / (1 - b0)] : [1, 1];
  };
  const fH = backFrac('hip_back_width', 'hips'), fW = backFrac('waist_back_width', 'waist'), fB = backFrac('back_width', 'bust');
  const tUb = clamp((L0.underbust - L0.waist) / (L0.bust - L0.waist || 1), 0, 1);
  const fU = [0, 1].map(i => fW[i] + (fB[i] - fW[i]) * tUb);
  // depth factors (relative to the girth factor); first guess: depth changes ~2x the arc
  const kbs = [fH, fH, fW, fU, fB, fB].map(f => clamp(1 + 2 * (f[0] - 1), 0.5, 1.8)).concat([1, 1]);
  const kfs = [fH, fH, fW, fU, fB, fB].map(f => clamp(1 + 2 * (f[1] - 1), 0.5, 1.8)).concat([1, 1]);
  const SIDE = 4;  // cm: half-width of the smooth back->front transition around the slice centre
  const rs = r('shoulder_w'), nx0 = m0.neck_w / 2, sx0 = Math.max(m0.shoulder_w / 2, nx0 + 2);
  // shoulder-width blend: rises from below the armpit to the shoulder line, then hands over
  // to the neck width at the neck base (the head keeps its own size)
  const sy0 = L0.neck - Math.tan((m0.shoulder_incl ?? 20) * Math.PI / 180) * (sx0 - nx0);
  const shoulderBlend = (y) => clamp((y - L0.armpit + 4) / (sy0 - L0.armpit + 4), 0, 1) * (1 - smooth01((y - sy0 + 1) / (L0.neck + 4 - sy0)));

  // bust / seat point spread: a smooth odd lateral warp of the front (bust) or back (seat)
  // that moves the points at +-x0 by d and fades out towards the centre line and the sides
  const spread = (key, y0) => {
    const x0 = (m0[key] || 0) / 2 * girth(y0);
    const d = m1[key] != null && m0[key] ? m1[key] / 2 - x0 : 0;
    return { x0, d: x0 > 1 ? clamp(d, -0.4 * x0, 0.4 * x0) : 0, y0 };
  };
  const bustS = spread('bust_points', L0.bust), seatS = spread('bum_points', H0);
  const phi = (u) => u * Math.exp(0.5 * (1 - u * u));  // odd, phi(1) = 1, phi'(1) = 0
  const VWIN = 12;  // cm: vertical half-height of the spread window
  const spreadDx = (S, dx, y) => {
    if (!S.d) return 0;
    const t = Math.abs(y - S.y0) / VWIN;
    return t >= 1 ? 0 : S.d * phi(dx / S.x0) * (1 - smooth01(t));
  };

  // torso model without the shoulder slope correction
  const torsoT = (x, y, z, out) => {
    const [cx, cz] = slice(torso, y);
    const g = girth(y);
    const s = smooth01(((z - cz) / SIDE + 1) / 2);
    const k = piecewiseC(gys, kbs, y) * (1 - s) + piecewiseC(gys, kfs, y) * s;
    const dx = (x - cx) * (g + (rs - g) * shoulderBlend(y));
    out[0] = cx + dx + spreadDx(bustS, dx, y) * s + spreadDx(seatS, dx, y) * (1 - s);
    out[1] = mapY(y); out[2] = cz + (z - cz) * g * k;
  };

  // calibrate the depths on the control slices (hips, waist, underbust, bust): back depth
  // until the back arc is on target, then front depth until the full girth is
  if (prep.bands) {
    const T = [0, 0, 0];
    const backArc = (pts, cz) => {
      const b = pts.filter(q => q[1] <= cz);
      let x0 = Infinity, x1 = -Infinity;
      for (const q of b) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
      return b.length > 2 ? hullPerimeter(b) - (x1 - x0) : 0;
    };
    const ring = [[1, fH], [2, fW], [3, fU], [4, fB]].map(([i, f]) => {
      const y = gys[i], ids = [], pts0 = [];
      for (let b = Math.floor(y - 0.6); b <= Math.ceil(y + 0.6); b++) {
        for (const v of prep.bands[b] || []) if (Math.abs(pos[3 * v + 1] - y) < 0.6) { ids.push(v); pts0.push([pos[3 * v], pos[3 * v + 2]]); }
      }
      const cz = slice(torso, y)[1];
      return { i, ids, cz, target: gvs[i] * hullPerimeter(pts0), targetB: gvs[i] * f[0] * backArc(pts0, cz) };
    });
    const project = (ids) => ids.map(v => { torsoT(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2], T); return [T[0], T[2]]; });
    // secant solve of f(k) = target on one control value
    const solve = (arr, i, f, target) => {
      let k0 = arr[i], e0 = f() - target;
      let k1 = clamp(k0 * (1 - 0.5 * e0 / target), 0.5, 1.8);
      for (let it = 0; it < 4 && Math.abs(e0) > 0.05; it++) {
        arr[i] = k1; const e1 = f() - target;
        const kn = Math.abs(e1 - e0) > 1e-6 ? k1 - e1 * (k1 - k0) / (e1 - e0) : k1;
        k0 = k1; e0 = e1; k1 = clamp(kn, 0.5, 1.8);
      }
      arr[i] = Math.abs(e0) <= 0.05 ? k0 : k1;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (const { i, ids, cz, target, targetB } of ring) {
        if (!(target > 0 && targetB > 0)) continue;
        solve(kbs, i, () => backArc(project(ids), cz), targetB);
        solve(kfs, i, () => hullPerimeter(project(ids)), target);
      }
      kbs[0] = kbs[1]; kbs[5] = kbs[4]; kfs[0] = kfs[1]; kfs[5] = kfs[4];
    }
  }

  // shoulder slope: lower/raise the shoulders in proportion to the distance from the neck
  const deg = Math.PI / 180;
  const yTop = L0.neck + 3;
  const wy = (y) => smooth01((y - L0.armpit) / (sy0 - L0.armpit)) * (1 - smooth01((y - L0.neck + 1) / (yTop - L0.neck + 1)));
  const ramp = (u) => 0.5 * (u + Math.sqrt(u * u + 4));  // smooth max(0, u)
  let slope = 0;
  const dropAt = (x, y) => slope ? slope * ramp(Math.abs(x) - nx0) * wy(y) : 0;

  const T = [0, 0, 0];
  const thigh = r('leg_circ'), hipShift = r('hips') - 1;
  const hipBlend0 = L0.crotch + 1;  // legs: thigh scaling below, pelvis (torso) scaling up to the hip line
  // leg model: thigh girth about the leg centre. Near the crotch the leg centre moves so that
  // the inner thigh stays on the midline (legs never cross); further down the legs shift
  // with the hips and thighs. Above the crotch it blends into the pelvis (torso model).
  const legT = (S, x, y, z, o) => {
    const [cx, cz] = slice(S, y);
    const t = clamp((L0.crotch - y) / Math.max(10, L0.crotch * 0.45), 0, 1);  // 0 at crotch -> 1 near knee
    const g = thigh * (1 - t) + t;
    const top = slice(S, L0.crotch - 2), tcx = slice(torso, y)[0];
    const tc = smooth01((y - (L0.crotch - 10)) / 10);
    const ccx = (cx + top[0] * (hipShift + thigh - 1) * 0.6) * (1 - tc) + (tcx + (cx - tcx) * g) * tc;
    o[0] = ccx + (x - cx) * g; o[1] = mapY(y); o[2] = cz + (z - cz) * g;
    const tHip = smooth01((y - hipBlend0) / (H0 - hipBlend0));
    if (tHip > 0) {
      const q = o.slice(); torsoT(x, y, z, o);
      for (let i = 0; i < 3; i++) o[i] = q[i] + (o[i] - q[i]) * tHip;
    }
  };
  const morphV = (v, o) => {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    const wb = W[3 * v], wa = W[3 * v + 1], wl = W[3 * v + 2];
    const p = part[v];
    let X = 0, Y = 0, Z = 0;
    // --- torso model
    {
      const [cx] = slice(torso, y);
      torsoT(x, y, z, T);
      X += wb * T[0]; Y += wb * (T[1] - dropAt(x - cx, y)); Z += wb * T[2];
    }
    // --- leg model (body vertices near the crotch blend both legs smoothly across the midline)
    if (wl > 0) {
      const wL = p === PART.L_LEG ? 1 : p === PART.R_LEG ? 0 : smooth01((x - slice(torso, y)[0] + 1.5) / 3);
      let lx = 0, ly = 0, lz = 0;
      if (wL > 0) { legT(legL, x, y, z, T); lx += wL * T[0]; ly += wL * T[1]; lz += wL * T[2]; }
      if (wL < 1) { legT(legR, x, y, z, T); lx += (1 - wL) * T[0]; ly += (1 - wL) * T[1]; lz += (1 - wL) * T[2]; }
      X += wl * lx; Y += wl * ly; Z += wl * lz;
    }
    // --- arm model: rigid-ish chain from the shoulder joint, scaled along the arm
    if (wa > 0) {
      const A = (p === PART.L_ARM || (p !== PART.R_ARM && x > 0)) ? arm.L : arm.R;
      const sign = A.J[0] >= 0 ? 1 : -1;
      const dx = x - A.J[0], dy = y - A.J[1], dz = z - A.J[2];
      const along = dx * A.dir[0] + dy * A.dir[1] + dz * A.dir[2];
      const px = dx - along * A.dir[0], py = dy - along * A.dir[1], pz = dz - along * A.dir[2];
      const t = Math.max(0, Math.min(1, along / A.len));
      const rad = Math.sqrt(r('bust')) * (1 - t) + r('wrist') * t;
      const al = along * r('arm_length');
      const Jx = A.J[0] + sign * (m1.shoulder_w - m0.shoulder_w) / 2;
      const Jy = mapY(A.J[1]) - (slope ? slope * ramp(sx0 - nx0) : 0), Jz = A.J[2];
      X += wa * (Jx + al * A.dir[0] + px * rad);
      // near the joint follow the torso's vertical map (armhole depth), further down stay rigid
    const yFix = (mapY(y) - y - (mapY(A.J[1]) - A.J[1])) * (1 - smooth01(along / (0.3 * A.len)));
    Y += wa * (Jy + al * A.dir[1] + py * rad + yFix);
      Z += wa * (Jz + al * A.dir[2] + pz * rad);
    }
    const ws = wb + wa + wl || 1;
    o[0] = X / ws; o[1] = Y / ws; o[2] = Z / ws;
  };

  // solve the shoulder slope on the actual shoulder tip (top of the arm seam) against the
  // neck base point; the result is linear in `slope`
  if (m1.shoulder_incl != null && m0.shoulder_incl != null && arm.R.tip != null) {
    const v = arm.R.tip, cN = slice(torso, L0.neck), xN = cN[0] - nx0;
    const a0 = Math.atan2(L0.neck - pos[3 * v + 1], Math.abs(pos[3 * v] - xN));
    const S0 = [0, 0, 0], S1 = [0, 0, 0], N = [0, 0, 0];
    morphV(v, S0); slope = 1; morphV(v, S1); slope = 0;
    torsoT(xN, L0.neck, cN[1], N);
    const nDrop = ramp(0) * wy(L0.neck);  // the neck point moves by slope * nDrop
    const want = Math.tan(clamp(a0 + (m1.shoulder_incl - m0.shoulder_incl) * deg, 0, 1.4)) * Math.abs(S0[0] - N[0]);
    const den = (S0[1] - S1[1]) - nDrop;
    if (den > 0.5) slope = (want - (N[1] - S0[1])) / den;
  }

  const out = new Float32Array(nv * 3), o = [0, 0, 0];
  for (let v = 0; v < nv; v++) { morphV(v, o); out[3 * v] = o[0]; out[3 * v + 1] = o[1]; out[3 * v + 2] = o[2]; }
  return out;
}

/** Perimeter of the 2D convex hull of pts ([x, z] pairs). Sorts pts in place. */
function hullPerimeter(pts) {
  if (pts.length < 3) return 0;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  let per = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; per += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return per;
}

/** Tape-measure style girth: convex-hull perimeter of the torso slice at height y. */
export function measureGirth(pos, part, y, band = 0.6, withLegs = false) {
  const pts = [];
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (!(p === PART.BODY || (withLegs && (p === PART.L_LEG || p === PART.R_LEG)))) continue;
    if (Math.abs(pos[3 * v + 1] - y) < band) pts.push([pos[3 * v], pos[3 * v + 2]]);
  }
  return hullPerimeter(pts);
}

export { landmarks };
