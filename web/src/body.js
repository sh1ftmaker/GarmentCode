// Measurement-driven mannequin morph.
//
// Deforms one of GarmentCode's base bodies so that its main measurements follow the
// GarmentCode body parameters (height, landmark lines, bust/underbust/waist/hips girths,
// shoulder width, arm length, wrist, thigh, neck). Regions come from GarmentCode's body
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
    arm[key] = { J, dir: [(tip[0] - J[0]) / len, (tip[1] - J[1]) / len, (tip[2] - J[2]) / len], len, pid };
  }
  return { base, W, torso, legL, legR, arm };
}

/** Morph the base body from measurements m0 (its own) to m1. Returns new positions (cm). */
export function morphBody(prep, m0, m1) {
  const { base, W, torso, legL, legR, arm } = prep;
  const { nv, pos, part } = base;
  const L0 = landmarks(m0), L1 = landmarks(m1);
  const r = (k) => (m1[k] && m0[k]) ? m1[k] / m0[k] : 1;

  // vertical map through the landmark lines
  const ys0 = [0, L0.crotch, L0.hips, L0.waist, L0.bust, L0.armpit, L0.neck, L0.top];
  const ys1 = [0, L1.crotch, L1.hips, L1.waist, L1.bust, L1.armpit, L1.neck, L1.top];
  const mapY = (y) => piecewise(ys0, ys1, y);
  // torso girth factor along the base height
  const gys = [L0.crotch - 6, L0.hips, L0.waist, L0.underbust, L0.bust, L0.armpit, L0.neck - 3, L0.neck + 2];
  const gvs = [r('hips') * 0.9 + 0.1, r('hips'), r('waist'), r('underbust'), r('bust'), r('bust'), r('neck_w'), 1];
  const girth = (y) => piecewise(gys, gvs, y);
  const rs = r('shoulder_w');
  const shoulderBlend = (y) => Math.max(0, Math.min(1, (y - L0.armpit + 4) / (L0.neck - L0.armpit + 4)));
  const slice = (s, y) => {
    const f = Math.max(0, Math.min(218.999, y)), k = Math.floor(f), t = f - k;
    return [s.cx[k] + (s.cx[k + 1] - s.cx[k]) * t, s.cz[k] + (s.cz[k + 1] - s.cz[k]) * t];
  };

  const out = new Float32Array(nv * 3);
  const thigh = r('leg_circ'), hipShift = r('hips') - 1;
  for (let v = 0; v < nv; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    const wb = W[3 * v], wa = W[3 * v + 1], wl = W[3 * v + 2];
    const p = part[v];
    let X = 0, Y = 0, Z = 0;
    // --- torso model
    {
      const [cx, cz] = slice(torso, y);
      const g = girth(y);
      const gx = g + (rs - g) * shoulderBlend(y);
      const tx = cx + (x - cx) * gx, tz = cz + (z - cz) * g, ty = mapY(y);
      X += wb * tx; Y += wb * ty; Z += wb * tz;
    }
    // --- leg model
    if (wl > 0) {
      const left = p === PART.L_LEG || (p !== PART.R_LEG && x > 0);
      const [cx, cz] = slice(left ? legL : legR, y);
      const t = Math.max(0, Math.min(1, (L0.crotch - y) / Math.max(10, L0.crotch * 0.45)));  // 0 at crotch -> 1 near knee
      const g = thigh * (1 - t) + t;
      const top = slice(left ? legL : legR, L0.crotch - 2);
      const shift = top[0] * hipShift * 0.6;
      let lx = cx + shift + (x - cx) * g, lz = cz + (z - cz) * g;
      // around the hips the legs belong to the pelvis: scale them with the torso girth
      const tHip = Math.max(0, Math.min(1, (y - (L0.crotch - 10)) / 10));
      if (tHip > 0) {
        const [tcx, tcz] = slice(torso, y);
        const gt = girth(y);
        lx = lx * (1 - tHip) + (tcx + (x - tcx) * gt) * tHip;
        lz = lz * (1 - tHip) + (tcz + (z - tcz) * gt) * tHip;
      }
      X += wl * lx; Y += wl * mapY(y); Z += wl * lz;
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
      const Jx = A.J[0] + sign * (m1.shoulder_w - m0.shoulder_w) / 2, Jy = mapY(A.J[1]), Jz = A.J[2];
      X += wa * (Jx + al * A.dir[0] + px * rad);
      Y += wa * (Jy + al * A.dir[1] + py * rad);
      Z += wa * (Jz + al * A.dir[2] + pz * rad);
    }
    const ws = wb + wa + wl || 1;
    out[3 * v] = X / ws; out[3 * v + 1] = Y / ws; out[3 * v + 2] = Z / ws;
  }
  return out;
}

/** Tape-measure style girth: convex-hull perimeter of the torso slice at height y. */
export function measureGirth(pos, part, y, band = 0.6, withLegs = false) {
  const pts = [];
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (!(p === PART.BODY || (withLegs && (p === PART.L_LEG || p === PART.R_LEG)))) continue;
    if (Math.abs(pos[3 * v + 1] - y) < band) pts.push([pos[3 * v], pos[3 * v + 2]]);
  }
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

export { landmarks };
