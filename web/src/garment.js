// Panel meshing and a small XPBD cloth solver that sews GarmentCode panels
// together around the body. All units are centimeters (GarmentCode units).
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
import { pieceGrains, edgeWarp, edgeCompliance } from './grain.js';

// ---------------------------------------------------------------------------
// 2D helpers
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function distToSegSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/**
 * Triangulate a panel outline with roughly uniform interior sampling. With a grain vector
 * (grain.js), the interior points form a square lattice along the warp and weft, so the
 * mesh has warp, weft and bias (diagonal) edges like the threads of the cloth and the
 * stretch compliance per edge can model a woven's anisotropy. Without one: a hexagonal
 * lattice.
 */
export function meshPanel(boundary, h, grain = null) {
  const n = boundary.length;
  // lattice frame: (u, v) = (across the grain, along the grain)
  const [gx, gy] = grain || [0, 1];
  const toL = ([x, y]) => [x * gy - y * gx, x * gx + y * gy];
  const fromL = (u, v) => [u * gy + v * gx, -u * gx + v * gy];
  const B = boundary.map(toL);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of B) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pts = boundary.map(p => [p[0], p[1]]);
  const keep2 = (0.6 * h) ** 2;
  // same vertex density either way (hexagonal cell 0.866 h², square cell a²)
  const sq = !!grain, a = sq ? 0.93 * h : h;
  const dy = sq ? a : h * Math.sqrt(3) / 2;
  // lattice phase anchored at the origin of the frame, so neighbouring pieces line up alike
  const y0 = sq ? Math.ceil(minY / dy) * dy + dy / 2 : minY + dy / 2;
  let row = 0;
  for (let y = y0; y < maxY; y += dy, row++) {
    const x0 = sq ? Math.ceil(minX / a) * a + a / 2 : minX + (row % 2 ? h / 2 : 0);
    for (let x = x0; x < maxX; x += a) {
      if (!pointInPolygon(x, y, B)) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const p = B[i], q = B[(i + 1) % n];
        if (distToSegSq(x, y, p[0], p[1], q[0], q[1]) < keep2) ok = false;
      }
      if (ok) pts.push(fromL(x, y));
    }
  }
  const flat = new Float64Array(pts.length * 2);
  pts.forEach((p, i) => { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1]; });
  const del = new Delaunator(flat);
  const tris = [];
  const t = del.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    const cx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3;
    const cy = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
    if (!pointInPolygon(cx, cy, boundary)) continue;
    // reject edges that connect non-adjacent boundary points across the outside
    const area = Math.abs((pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) -
                          (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1])) / 2;
    if (area < 1e-6) continue;
    tris.push(a, b, c);
  }
  return { pts, tris };
}

// ---------------------------------------------------------------------------
// Body signed distance field
export class SDF {
  constructor(buffer) {
    const f = new Float32Array(buffer, 0, 4);
    const u = new Uint32Array(buffer, 16, 3);
    this.min = [f[0], f[1], f[2]];
    this.cell = f[3];
    this.n = [u[0], u[1], u[2]];
    const N = u[0] * u[1] * u[2];
    this.d = new Int16Array(buffer, 28, N);
    // 1 where the closest body surface is an arm (for GarmentCode's skirt/pants arm filter)
    this.arm = buffer.byteLength >= 28 + 3 * N ? new Uint8Array(buffer, 28 + 2 * N, N) : null;
    this.lastArm = 0;
  }
  // returns distance (cm); writes gradient to g
  sample(x, y, z, g) {
    const [nx, ny, nz] = this.n, c = this.cell;
    let fx = (x - this.min[0]) / c, fy = (y - this.min[1]) / c, fz = (z - this.min[2]) / c;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 100;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const d = this.d, sx = 1, sy = nx, sz = nx * ny;
    const o = i + sy * j + sz * k;
    this.lastArm = this.arm ? this.arm[o + (tx > 0.5 ? sx : 0) + (ty > 0.5 ? sy : 0) + (tz > 0.5 ? sz : 0)] : 0;
    const c000 = d[o], c100 = d[o + sx], c010 = d[o + sy], c110 = d[o + sx + sy];
    const c001 = d[o + sz], c101 = d[o + sx + sz], c011 = d[o + sy + sz], c111 = d[o + sx + sy + sz];
    const c00 = c000 + (c100 - c000) * tx, c10 = c010 + (c110 - c010) * tx;
    const c01 = c001 + (c101 - c001) * tx, c11 = c011 + (c111 - c011) * tx;
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
    if (g) {
      // analytic gradient of the trilinear interpolant
      const gx = ((c100 - c000) * (1 - ty) + (c110 - c010) * ty) * (1 - tz) +
                 ((c101 - c001) * (1 - ty) + (c111 - c011) * ty) * tz;
      const gy = (c10 - c00) * (1 - tz) + (c11 - c01) * tz;
      const gz = c1 - c0;
      const l = Math.hypot(gx, gy, gz) || 1;
      g[0] = gx / l; g[1] = gy / l; g[2] = gz / l;
    }
    return (c0 + (c1 - c0) * tz) / 10; // mm -> cm
  }
}

// ---------------------------------------------------------------------------
// Garment construction
//
// Like GarmentCode's BoxMesh, stitched vertices are merged so the garment starts
// sewn. To avoid seams cutting through the body, body/leg panels are first bent
// around the body's vertical axis (a cylinder fitted to each panel), and the merged
// mesh is then projected out of the body.

const BODY_AXIS = { c: [0, 0, 1], a: [0, 1, 0] };   // vertical axis through the torso (cm)
const ARM = 0, LEG = 1, BODY = 2;

function panelKind(label) { return label === 'leg' ? LEG : label === 'body' ? BODY : ARM; }

/**
 * Bend a placed flat panel around an axis (in place). Each slice along the axis gets
 * its own radius so the slice reaches roughly a quarter turn: tops become cylinders,
 * skirts cones, sleeves tubes around the arm.
 */
function wrapPanel(P, n0, axis, rMin = 9, ringCheck = false, base = null) {
  const [cx, cy, cz] = axis.c, [ax, ay, az] = axis.a;
  // panel normal made perpendicular to the axis, oriented away from it
  const na = n0[0] * ax + n0[1] * ay + n0[2] * az;
  let nx = n0[0] - na * ax, ny = n0[1] - na * ay, nz = n0[2] - na * az;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 0.7) return false;           // panel not facing the axis (e.g. horizontal pieces)
  nx /= nl; ny /= nl; nz /= nl;
  if (base) [nx, ny, nz] = base.n;      // overlay: same frame as the panel underneath
  const cnt = P.length / 3;
  const t = new Float32Array(cnt), u = new Float32Array(cnt), d = new Float32Array(cnt);
  let dMean = 0;
  for (let i = 0; i < cnt; i++) {
    const rx = P[3 * i] - cx, ry = P[3 * i + 1] - cy, rz = P[3 * i + 2] - cz;
    t[i] = rx * ax + ry * ay + rz * az;
    d[i] = rx * nx + ry * ny + rz * nz;
    dMean += d[i];
  }
  dMean /= cnt;
  if (!base && dMean < 0) { nx = -nx; ny = -ny; nz = -nz; dMean = -dMean; for (let i = 0; i < cnt; i++) d[i] = -d[i]; }
  if (!base && dMean < 3) return false;
  // tangent = a x n
  const tx = ay * nz - az * ny, ty = az * nx - ax * nz, tz = ax * ny - ay * nx;
  let uMin = Infinity, uMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (let i = 0; i < cnt; i++) {
    const rx = P[3 * i] - cx, ry = P[3 * i + 1] - cy, rz = P[3 * i + 2] - cz;
    u[i] = rx * tx + ry * ty + rz * tz;
    uMin = Math.min(uMin, u[i]); uMax = Math.max(uMax, u[i]);
    tMin = Math.min(tMin, t[i]); tMax = Math.max(tMax, t[i]);
  }
  if (base) {   // follow the panel underneath, keeping the drafted distance in front of it
    for (let i = 0; i < cnt; i++) {
      const r = base.radius(t[i]), rr = r + (d[i] - base.dMean), th = u[i] / r;
      const cs = Math.cos(th), sn = Math.sin(th);
      P[3 * i] = cx + t[i] * ax + rr * (cs * nx + sn * tx);
      P[3 * i + 1] = cy + t[i] * ay + rr * (cs * ny + sn * ty);
      P[3 * i + 2] = cz + t[i] * az + rr * (cs * nz + sn * tz);
    }
    return base;
  }
  // only wrap panels that face the axis (e.g. not collar pieces placed off to the side)
  const uc = (uMin + uMax) / 2;
  if (Math.abs(uc) > Math.max(dMean, 12) * 0.9 || uMin > dMean + 5 || uMax < -dMean - 5) return false;
  // Narrow panels that GarmentCode already arranged in a ring around the axis (e.g. a
  // 15-gore skirt) are facets of that ring: bending each one to a quarter turn would
  // collapse it into the body.
  if (ringCheck && (uMax - uMin) / 2 < 0.6 * dMean) return false;
  // per-slice half-width -> radius
  const BIN = 2, nb = Math.max(1, Math.ceil((tMax - tMin) / BIN) + 1);
  const wb = new Float32Array(nb);
  for (let i = 0; i < cnt; i++) { const k = Math.min(nb - 1, Math.floor((t[i] - tMin) / BIN)); wb[k] = Math.max(wb[k], Math.abs(u[i])); }
  const rb = new Float32Array(nb);
  for (let k = 0; k < nb; k++) {
    let w = wb[k];
    for (let j = Math.max(0, k - 1); j <= Math.min(nb - 1, k + 1); j++) w = Math.max(w, wb[j] * 0.95);
    rb[k] = Math.max(rMin, (w * 2) / Math.PI * 1.05);
  }
  const radius = (ti) => {
    const f = Math.max(0, Math.min(nb - 1.001, (ti - tMin) / BIN - 0.5)), k = Math.floor(f), q = f - k;
    return rb[k] * (1 - q) + rb[Math.min(nb - 1, k + 1)] * q;
  };
  for (let i = 0; i < cnt; i++) {
    const r = radius(t[i]);
    const rr = r + (d[i] - dMean);
    const th = u[i] / r;
    const cs = Math.cos(th), sn = Math.sin(th);
    P[3 * i] = cx + t[i] * ax + rr * (cs * nx + sn * tx);
    P[3 * i + 1] = cy + t[i] * ay + rr * (cs * ny + sn * ty);
    P[3 * i + 2] = cz + t[i] * az + rr * (cs * nz + sn * tz);
  }
  return { n: [nx, ny, nz], dMean, radius };
}

/**
 * GarmentCode places sleeves at the design's sleeve angle, not along the mannequin's arms
 * (which hang at the body's arm pose angle). A sleeve left at the wrong angle starts with
 * the arm cutting through it and stays caught on the wrong side, so swing each side's
 * sleeve group (sleeve + cuff panels) about its armhole end in the frontal plane until it
 * points along the arm.
 */
function alignSleeves(panels, armAxes) {
  for (const sgn of [1, -1]) {
    const ax = sgn > 0 ? armAxes.pos : armAxes.neg;
    if (!ax) continue;
    const group = panels.filter(q => {
      if (q.kind !== ARM || q.p.map3d) return false;   // pieces with their own placement (src/fs) are already along the arm
      let mx = 0; for (let i = 0; i < q.P.length; i += 3) mx += q.P[i];
      return mx * sgn > 0;
    });
    if (!group.length) continue;
    // principal direction of the group in the x-y (frontal) plane
    let n = 0, cx = 0, cy = 0;
    for (const q of group) for (let i = 0; i < q.P.length; i += 3) { cx += q.P[i]; cy += q.P[i + 1]; n++; }
    cx /= n; cy /= n;
    let sxx = 0, sxy = 0, syy = 0, inner = Infinity;
    for (const q of group) for (let i = 0; i < q.P.length; i += 3) {
      const dx = q.P[i] - cx, dy = q.P[i + 1] - cy;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      inner = Math.min(inner, q.P[i] * sgn);
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(th), dy = Math.sin(th);
    if (dx * sgn < 0) { dx = -dx; dy = -dy; }            // pointing away from the body
    // arm direction (towards the hand) in the frontal plane
    let axx = ax.a[0], axy = ax.a[1];
    const al = Math.hypot(axx, axy);
    if (al < 0.3) continue;
    axx /= al; axy /= al;
    if (axx * sgn < 0) { axx = -axx; axy = -axy; }
    const ang = Math.atan2(axy, axx) - Math.atan2(dy, dx);
    if (Math.abs(ang) < 0.05 || Math.abs(ang) > 1.2) continue;
    // pivot: the armhole end of the sleeve (innermost points)
    let px = 0, py = 0, m = 0;
    for (const q of group) for (let i = 0; i < q.P.length; i += 3) if (q.P[i] * sgn < inner + 3) { px += q.P[i]; py += q.P[i + 1]; m++; }
    px /= m; py /= m;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const q of group) {
      const P = q.P;
      for (let i = 0; i < P.length; i += 3) {
        const rx = P[i] - px, ry = P[i + 1] - py;
        P[i] = px + c * rx - s * ry; P[i + 1] = py + s * rx + c * ry;
      }
      const [nx, ny, nz] = q.n0;
      q.n0 = [c * nx - s * ny, s * nx + c * ny, nz];
    }
  }
}

/**
 * Panelled ("gored") skirts: N panels sewn side to side in a ring, each with a waist edge.
 * GarmentCode lays them out flat, and bending each panel around the body slice by slice
 * mangles strongly flared panels (e.g. the default 4 panels): the slanted side seams of
 * neighbours land in different places and the welded seams start crumpled. Instead
 * place the whole ring as a cone: a flared panel is a piece of a cone's development,
 * with its apex where the two side seams meet, so each point maps by its polar
 * coordinates around that apex (distance below the waist -> slant, angle -> share of
 * the turn). Neighbouring side seams then coincide, curved hems stay intact, and the
 * placement is exact whenever the fabric fits a cone; fabric beyond a capped flare is
 * folded into even radial flutes instead of being squeezed.
 * Returns the placed panel records (empty if the pattern has no such ring).
 */
function placeSkirtRing(panels, stitches) {
  const cand = panels.filter(q => q.kind === LEG && !q.p.map3d);
  const N = cand.length;
  if (N < 3) return [];
  // the candidates must form one cycle of side seams; collect each panel's two side seams,
  // and as its waist the edge labelled as such or, with a waistband, the edge sewn to it
  const idx = new Map(cand.map((q, i) => [q.p.name, i]));
  const sides = cand.map(() => []), nbrs = cand.map(() => new Set()), sewn = cand.map(() => []);
  for (const s of stitches) {
    const a = idx.get(s.a), b = idx.get(s.b);
    if (a !== undefined && b !== undefined && a !== b) {
      sides[a].push(s.ia); sides[b].push(s.ib); nbrs[a].add(b); nbrs[b].add(a);
    } else if (a !== undefined && b === undefined) sewn[a].push(...s.ia);
    else if (b !== undefined && a === undefined) sewn[b].push(...s.ib);
  }
  if (sides.some(l => l.length !== 2) || nbrs.some(n => n.size !== 2)) return [];
  const waist = cand.map((q, n) => {
    const l = q.p.labels && q.p.labels.lower_interface;
    return l && l.length >= 2 ? l : sewn[n];
  });
  if (waist.some(w => w.length < 2)) return [];

  const [cx, , cz] = BODY_AXIS.c;
  const info = [];
  for (let n = 0; n < N; n++) {
    const q = cand[n], { pts, p, P, R } = q, B = p.boundary;
    const wl = waist[n];
    let wx = 0, wyy = 0; for (const i of wl) { wx += pts[i][0]; wyy += pts[i][1]; } wx /= wl.length; wyy /= wl.length;
    // side seams as lines (end to end); the one with the smaller x is "left"
    const lines = sides[n].map(l => {
      const a = B[l[0]], b = B[l[l.length - 1]];
      let mx = 0; for (const i of l) mx += B[i][0];
      return { a, b, mx: mx / l.length };
    }).sort((u, v) => u.mx - v.mx);
    // apex: where the two side lines meet (on the waist side for a flared panel)
    const [L1, L2] = lines;
    const d1 = [L1.b[0] - L1.a[0], L1.b[1] - L1.a[1]], d2 = [L2.b[0] - L2.a[0], L2.b[1] - L2.a[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2)) return [];   // parallel sides: not a cone
    const t = ((L2.a[0] - L1.a[0]) * d2[1] - (L2.a[1] - L1.a[1]) * d2[0]) / den;
    const ap = [L1.a[0] + t * d1[0], L1.a[1] + t * d1[1]];
    // the apex must lie beyond the waist, away from the panel (flaring towards the hem)
    let my = 0, mxx = 0; for (const [x, y] of pts) { mxx += x; my += y; } mxx /= pts.length; my /= pts.length;
    const toW = [wx - mxx, wyy - my], toA = [ap[0] - wx, ap[1] - wyy];
    if (toW[0] * toA[0] + toW[1] * toA[1] <= 0) return [];
    const ang = (x, y) => Math.atan2(x - ap[0], -(y - ap[1]) * Math.sign(wyy - my || 1));
    // polar angles of the side lines (measured around the apex), left -> right
    const phL = ang(...(Math.hypot(L1.a[0] - ap[0], L1.a[1] - ap[1]) > Math.hypot(L1.b[0] - ap[0], L1.b[1] - ap[1]) ? L1.a : L1.b));
    const phR = ang(...(Math.hypot(L2.a[0] - ap[0], L2.a[1] - ap[1]) > Math.hypot(L2.b[0] - ap[0], L2.b[1] - ap[1]) ? L2.a : L2.b));
    const Phi = Math.abs(phR - phL);
    if (!(Phi > 0.01 && Phi < Math.PI)) return [];
    let rhoW = 0; for (const i of wl) rhoW += Math.hypot(pts[i][0] - ap[0], pts[i][1] - ap[1]); rhoW /= wl.length;
    // 3D waist height and the panel's angle around the body
    let wy = 0; for (const i of wl) wy += P[3 * i + 1]; wy /= wl.length;
    let sx = 0, sz = 0; for (let i = 0; i < P.length; i += 3) { sx += P[i] - cx; sz += P[i + 2] - cz; }
    const pang = Math.atan2(sx, sz);
    // does the panel's 2D +x run with increasing angle (anticlockwise seen from above)?
    const sgn = (R[0][0] * Math.cos(pang) - R[2][0] * Math.sin(pang)) >= 0 ? 1 : -1;
    info.push({ q, ap, ang, phL, phR, Phi, rhoW, wy, pang, sgn });
  }
  const sumPhi = info.reduce((a, I) => a + I.Phi, 0);
  const rhoW = info.reduce((a, I) => a + I.rhoW, 0) / N;
  const wy = info.reduce((a, I) => a + I.wy, 0) / N;
  const Lw = rhoW * sumPhi, rW = Math.max(6, Lw / (2 * Math.PI));
  // A cone holds the fabric exactly when sin(flare) = sumPhi / 2pi; beyond a cap the
  // excess is folded into flutes.
  const sinB = Math.min(Math.sin(0.5), sumPhi / (2 * Math.PI));
  const cosB = Math.sqrt(1 - sinB * sinB);
  let sMax = 0;
  for (const I of info) for (const [x, y] of I.q.pts) sMax = Math.max(sMax, Math.hypot(x - I.ap[0], y - I.ap[1]) - I.rhoW);
  const hemLen = (rhoW + sMax) * sumPhi;
  const fluted = sumPhi / (2 * Math.PI) > sinB * 1.05;
  const m = fluted ? N * Math.max(1, Math.round(hemLen / N / 45)) : 0;
  info.sort((a, b) => a.pang - b.pang);
  const share = 2 * Math.PI / N, a0 = info[0].pang;
  info.forEach((I, i) => {
    const { q } = I, P = q.P;
    const th0 = a0 + i * share;
    q.pts.forEach(([x, y], k) => {
      const s = Math.max(0, Math.hypot(x - I.ap[0], y - I.ap[1]) - I.rhoW);
      let f = (I.ang(x, y) - I.phL) / (I.phR - I.phL);
      f = Math.min(1, Math.max(0, f));
      if (I.sgn < 0) f = 1 - f;
      const th = th0 + (f - 0.5) * share;
      const r0 = rW + s * sinB, len = (rhoW + s) * sumPhi;
      let r = r0;
      if (m && len > 2 * Math.PI * r0) {
        // sinusoidal flutes whose length matches the fabric (per wave ~ 4 x amplitude when deep)
        const A = Math.min(0.8 * r0, Math.max(Math.sqrt(2 * ((len / (2 * Math.PI)) ** 2 - r0 * r0)) / m,
          (len - 2 * Math.PI * r0) / (4 * m)));
        r = r0 + A * Math.cos(m * (th - a0));
      }
      P[3 * k] = cx + r * Math.sin(th);
      P[3 * k + 1] = wy - s * cosB;
      P[3 * k + 2] = cz + r * Math.cos(th);
    });
    q.n0 = [Math.sin(th0), 0, Math.cos(th0)];
  });
  return info.map(I => I.q);
}

/**
 * Top of the head and the head's vertical axis, found by probing the body SDF (so it
 * works for any morphed body). Returns null when there is no SDF.
 */
function headFromSDF(sdf) {
  if (!sdf) return null;
  const inside = (y) => {
    const pts = [];
    for (let x = -12; x <= 12; x += 1.5) for (let z = -16; z <= 22; z += 1.5) if (sdf.sample(x, y, z) < 0) pts.push([x, z]);
    return pts;
  };
  let y = sdf.min[1] + (sdf.n[1] - 2) * sdf.cell;
  while (y > sdf.min[1] && !inside(y).length) y -= 1;
  if (y <= sdf.min[1]) return null;
  const top = y, pts = inside(top - 10);
  if (pts.length < 4) return null;
  let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
  let r = 0; for (const [x, z] of pts) r = Math.max(r, Math.hypot(x - cx, z - cz));
  return { top, axis: { c: [cx, 0, cz], a: [0, 1, 0] }, r: r + 1 };
}

/**
 * Head pieces (e.g. GarmentCode's hood) are drafted standing tall above the neckline.
 * Starting there, the hood topples to a random side before it reaches the head, so
 * lower such panels until their top just clears the head, then wrap them around the
 * head's axis with a little clearance, like torso panels around the body.
 */
function placeHeadPieces(panels, head) {
  for (const q of panels) {
    const P = q.P;
    if (q.kind === ARM || q.p.map3d) continue;
    let my = 0, maxY = -Infinity;
    for (let i = 1; i < P.length; i += 3) { my += P[i]; maxY = Math.max(maxY, P[i]); }
    my /= P.length / 3;
    if (my < head.top - 12) continue;    // collars, lapels etc. stay around the neck
    const dy = Math.max(0, maxY - (head.top + 2));
    for (let i = 1; i < P.length; i += 3) P[i] -= dy;
    if (wrapPanel(P, q.n0, head.axis, head.r + 2)) q.headAxis = head.axis;
  }
}

/**
 * Overlay panels: drafted parallel to a larger torso panel, a little in front of it and
 * within its outline (e.g. a kangaroo pocket on the front). Wrapped on their own, a
 * narrower panel bends more tightly and would start inside the panel it lies on, so it
 * is wrapped with that panel's shape instead (sets q.under).
 */
function findOverlays(panels) {
  const frame = (q) => {
    const R = q.R, P = q.P, c = [0, 0, 0], n = P.length / 3;
    for (let i = 0; i < P.length; i += 3) { c[0] += P[i] / n; c[1] += P[i + 1] / n; c[2] += P[i + 2] / n; }
    return { c, e1: [R[0][0], R[1][0], R[2][0]], e2: [R[0][1], R[1][1], R[2][1]] };
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cand = panels.filter(q => q.kind === BODY && !q.p.map3d && !q.headAxis);
  for (const q of cand) q.fr = frame(q);
  for (const q of cand) {
    for (const b of cand) {
      if (b === q || dot(q.n0, b.n0) < 0.98) continue;
      // in front of b (away from the body axis), by a few cm
      const out = Math.sign(dot([b.fr.c[0] - BODY_AXIS.c[0], 0, b.fr.c[2] - BODY_AXIS.c[2]], b.n0)) || 1;
      const off = out * dot([q.fr.c[0] - b.fr.c[0], q.fr.c[1] - b.fr.c[1], q.fr.c[2] - b.fr.c[2]], b.n0);
      if (off < 0.5 || off > 8) continue;
      // within b's outline (bounding box in b's plane)
      const box = (P, f) => {
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
          const r = [P[i] - b.fr.c[0], P[i + 1] - b.fr.c[1], P[i + 2] - b.fr.c[2]];
          const x = dot(r, b.fr.e1), y = dot(r, b.fr.e2);
          a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y);
        }
        return [a0, a1, b0, b1];
      };
      const qb = box(q.P), bb = box(b.P), tol = 1;
      if (qb[0] < bb[0] - tol || qb[1] > bb[1] + tol || qb[2] < bb[2] - tol || qb[3] > bb[3] + tol) continue;
      q.under = b;
      break;
    }
  }
  for (const q of cand) if (q.under && q.under.under) q.under = null;   // no chains
}

/** Build the simulation-ready garment from the exported GarmentCode pattern. */
export function buildGarment(pattern, h, sdf, { armAxes = null, lift = pattern.lift ?? 7, grain = null } = {}) {
  const grains = pieceGrains(pattern, grain);   // grain direction per panel (grain.js)
  // 1. mesh + place every panel
  const panels = pattern.panels.map((p, pi) => {
    const { pts, tris } = meshPanel(p.boundary, h, grains[p.name].vec);   // lattice along the grain
    const R = p.rotation, T = p.translation;
    const P = new Float32Array(pts.length * 3);
    pts.forEach(([x, y], i) => {
      P[3 * i] = R[0][0] * x + R[0][1] * y + T[0];
      P[3 * i + 1] = R[1][0] * x + R[1][1] * y + T[1];
      P[3 * i + 2] = R[2][0] * x + R[2][1] * y + T[2];
    });
    if (p.map3d) pts.forEach(([x, y], i) => P.set(p.map3d(x, y), 3 * i));   // e.g. FreeSewing pieces (src/fs)
    // Some lone components (e.g. a waistband with nothing to attach to) come out of
    // GarmentCode unplaced: far above the head and in the body's centre plane.
    let minY = Infinity, maxY = -Infinity, sumD = 0;
    for (let i = 0; i < P.length; i += 3) { minY = Math.min(minY, P[i + 1]); maxY = Math.max(maxY, P[i + 1]); }
    const levels0 = pattern.attach_levels || {};
    const bodyTop = (levels0.strapless_top || 130) + 60;
    if (minY > bodyTop && levels0.lower_interface) {
      const dy = levels0.lower_interface - maxY + 2;
      for (let i = 1; i < P.length; i += 3) P[i] += dy;
    }
    for (let i = 0; i < P.length; i += 3) sumD += P[i + 2] - BODY_AXIS.c[2];
    const zMean = sumD / (P.length / 3);
    if (Math.abs(zMean) < 3 && Math.abs(R[2][2]) > 0.7) {   // in the centre plane: move it in front / behind
      const back = /back|btorso|_b(_|$)/.test(p.name);
      const dz = (back ? -18 : 18) - zMean;
      for (let i = 2; i < P.length; i += 3) P[i] += dz;
    }
    // GarmentCode places shoulder seams ~3 cm below the shoulder surface; starting there,
    // the out-of-body projection pushes straps sideways off the shoulder. Start a little
    // higher and let gravity settle the garment onto the body instead.
    for (let i = 1; i < P.length; i += 3) P[i] += lift;
    const flat = new Float32Array(P);
    const kind = panelKind(p.label);
    const n0 = [R[0][2], R[1][2], R[2][2]];
    return { p, pi, pts, tris, P, flat, kind, n0, R, gv: grains[p.name].vec, rib: grains[p.name].rib };
  });
  if (armAxes) alignSleeves(panels, armAxes);
  const head = headFromSDF(sdf);
  if (head) placeHeadPieces(panels, head);
  const ring = new Set(placeSkirtRing(panels, pattern.stitches));
  findOverlays(panels);
  // panels lying on top of another one (e.g. a patch pocket) are wrapped after it
  const order = panels.filter(q => !q.under).concat(panels.filter(q => q.under));
  for (const q of order) {
    const { p, P, kind, n0 } = q;
    if (ring.has(q)) { q.axis = BODY_AXIS; continue; }
    if (q.headAxis) { q.axis = q.headAxis; continue; }
    if (q.under && q.under.wrap) {
      q.wrap = wrapPanel(P, n0, q.under.axis, 9, false, q.under.wrap);
      q.axis = q.under.axis;
      continue;
    }
    // One-leg panels (trousers) wrap around their own leg, everything else around the torso.
    let xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < P.length; i += 3) { xMin = Math.min(xMin, P[i]); xMax = Math.max(xMax, P[i]); }
    const oneLeg = kind === LEG && (xMin > -3 || xMax < 3) && /pant|leg/.test(p.name);
    let axis = null;
    if (oneLeg) {
      const xc = (xMin + xMax) / 2;
      axis = { c: [xc, 0, BODY_AXIS.c[2]], a: BODY_AXIS.a };
      wrapPanel(P, n0, axis, 7);
    } else if (kind !== ARM) { axis = BODY_AXIS; q.wrap = wrapPanel(P, n0, BODY_AXIS, 9, true); }
    else if (armAxes) {   // sleeves: wrap around the arm on the panel's side
      let mx = 0; for (let i = 0; i < P.length; i += 3) mx += P[i];
      axis = (mx >= 0 ? armAxes.pos : armAxes.neg) || null;
      if (axis) wrapPanel(P, n0, axis, 3.5);
    }
    q.axis = p.map3d ? null : axis;   // pieces with their own 3D placement keep it (no radial push-out)
  }
  const offsets = {};
  let total = 0;
  for (const q of panels) { offsets[q.p.name] = total; q.base = total; total += q.pts.length; }

  // 2. weld stitched vertices (union-find), as GarmentCode's BoxMesh does
  const parent = new Int32Array(total).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const s of pattern.stitches) {
    const oa = offsets[s.a], ob = offsets[s.b];
    if (oa === undefined || ob === undefined) continue;
    for (let k = 0; k < s.ia.length && k < s.ib.length; k++) {
      const a = find(oa + s.ia[k]), b = find(ob + s.ib[k]);
      if (a !== b) parent[a] = b;
    }
  }
  const remap = new Int32Array(total).fill(-1);
  let nv = 0;
  for (let i = 0; i < total; i++) { const r = find(i); if (remap[r] < 0) remap[r] = nv++; remap[i] = remap[r]; }

  const positions = new Float32Array(nv * 3), flat = new Float32Array(nv * 3), cnt = new Float32Array(nv);
  const uvs = new Float32Array(nv * 2), panelOf = new Uint16Array(nv), kind = new Uint8Array(nv).fill(ARM);
  const seamVert = new Uint8Array(nv);
  const axisOf = new Array(nv).fill(null);   // axis the vertex's panel was wrapped around
  for (const q of panels) {
    q.pts.forEach(([x, y], i) => {
      const v = remap[q.base + i];
      positions[3 * v] += q.P[3 * i]; positions[3 * v + 1] += q.P[3 * i + 1]; positions[3 * v + 2] += q.P[3 * i + 2];
      flat[3 * v] += q.flat[3 * i]; flat[3 * v + 1] += q.flat[3 * i + 1]; flat[3 * v + 2] += q.flat[3 * i + 2];
      // texture coordinates in the grain frame (v along the warp), so a print follows the cut
      if (cnt[v] === 0) { uvs[2 * v] = (x * q.gv[1] - y * q.gv[0]) / 25; uvs[2 * v + 1] = (x * q.gv[0] + y * q.gv[1]) / 25; panelOf[v] = q.pi; kind[v] = q.kind; axisOf[v] = q.axis; }
      else { seamVert[v] = 1; kind[v] = Math.min(kind[v], q.kind) === ARM ? ARM : Math.max(kind[v], q.kind); }
      cnt[v]++;
    });
  }
  for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { positions[3 * v + c] /= cnt[v]; flat[3 * v + c] /= cnt[v]; }

  // 3. triangles, stretch edges and bending pairs (rest state from the 2D pattern)
  const index = [], stretch = [], stretchRest = [], stretchWarp = [], bend = [], bendRest = [], bendWarp = [], seamBend = [], seamBendRest = [], seamBendWarp = [];
  const edgeSeen = new Map();
  for (const q of panels) {
    const d2 = (a, b) => Math.hypot(q.pts[a][0] - q.pts[b][0], q.pts[a][1] - q.pts[b][1]);
    for (let t = 0; t < q.tris.length; t += 3) {
      const loc = [q.tris[t], q.tris[t + 1], q.tris[t + 2]];
      const glob = loc.map(i => remap[q.base + i]);
      if (glob[0] === glob[1] || glob[1] === glob[2] || glob[0] === glob[2]) continue;
      index.push(...glob);
      for (let e = 0; e < 3; e++) {
        const a = glob[e], b = glob[(e + 1) % 3];
        const key = a < b ? a * nv + b : b * nv + a;
        const prev = edgeSeen.get(key);
        if (prev === undefined) {
          edgeSeen.set(key, { panel: q.pi, opp: loc[(e + 2) % 3], q, la: loc[e], lb: loc[(e + 1) % 3], ga: a, si: stretchRest.length });
          stretch.push(a, b); stretchRest.push(d2(loc[e], loc[(e + 1) % 3]));
          const pa = q.pts[loc[e]], pb = q.pts[loc[(e + 1) % 3]];
          stretchWarp.push(edgeWarp(q.gv, pb[0] - pa[0], pb[1] - pa[1]) + (q.rib ? 2 : 0));   // angle to the grain (+2: ribbing)
        } else if (prev && prev.panel === q.pi && (prev.la === loc[e] || prev.la === loc[(e + 1) % 3]) && (prev.lb === loc[e] || prev.lb === loc[(e + 1) % 3])) {
          bend.push(remap[q.base + prev.opp], glob[(e + 2) % 3]);
          bendRest.push(d2(prev.opp, loc[(e + 2) % 3]));
          const po = q.pts[prev.opp], pc = q.pts[loc[(e + 2) % 3]];
          bendWarp.push(edgeWarp(q.gv, pc[0] - po[0], pc[1] - po[1]) + (q.rib ? 2 : 0));
          edgeSeen.set(key, null);
        } else if (prev) {
          // Across a seam: the two triangles live in different panels (or are joined by a seam
          // within one panel, e.g. a sleeve's underarm or a band closed into a ring). Rest shape = the hinge
          // unfolded flat, so seams resist bending like the rest of the fabric (as in a merged
          // BoxMesh) instead of acting as free hinges that crease.
          const P1 = prev.q.pts, P2 = q.pts;
          const dd = (P, i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
          // local ids of the shared edge in each panel, matched by global vertex
          const a1 = prev.ga === a ? prev.la : prev.lb, b1 = prev.ga === a ? prev.lb : prev.la;
          const a2 = loc[e], b2 = loc[(e + 1) % 3], c2 = loc[(e + 2) % 3];
          const L = dd(P1, a1, b1) || 1e-6;
          const ac = dd(P1, a1, prev.opp), bc = dd(P1, b1, prev.opp);
          const ad = dd(P2, a2, c2), bd = dd(P2, b2, c2);
          const xc = (L * L + ac * ac - bc * bc) / (2 * L), yc = Math.sqrt(Math.max(0, ac * ac - xc * xc));
          const xd = (L * L + ad * ad - bd * bd) / (2 * L), yd = -Math.sqrt(Math.max(0, ad * ad - xd * xd));
          // a seam edge's rest length is shared by both sides, so ease is split between them
          stretchRest[prev.si] = 0.5 * (L + dd(P2, a2, b2));
          seamBend.push(remap[prev.q.base + prev.opp], glob[(e + 2) % 3]);
          seamBendRest.push(Math.hypot(xc - xd, yc - yd));
          // the pair runs across the seam: roughly along the normal of the seam edge in panel 1
          const ea = P1[a1], eb = P1[b1];
          seamBendWarp.push(edgeWarp(prev.q.gv, eb[1] - ea[1], ea[0] - eb[0]) + (prev.q.rib ? 2 : 0));
          edgeSeen.set(key, null);
        }
      }
    }
  }

  // seam lines for rendering: panel boundary edges whose both ends are shared (sewn) vertices
  const seamLines = [];
  for (const q of panels) {
    const n = q.p.boundary.length;
    for (let i = 0; i < n; i++) {
      const a = remap[q.base + i], b = remap[q.base + (i + 1) % n];
      if (a !== b && seamVert[a] && seamVert[b]) seamLines.push(a, b);
    }
  }

  // 4. attachments (GarmentCode's Warp setup, inequality constraints)
  const attach = [], attachY = [], collar = [], collarX = [];
  const levels = pattern.attach_levels || {};
  const seenA = new Set();
  for (const q of panels) {
    for (const [label, ids] of Object.entries(q.p.labels || {})) {
      if (!(label in levels)) continue;
      for (const i of ids) {
        const v = remap[q.base + i];
        const key = label + ':' + v;
        if (seenA.has(key)) continue;
        seenA.add(key);
        if (label.endsWith('_collar')) { collar.push(v); collarX.push(levels[label]); }
        // never lift an edge above where GarmentCode placed it (e.g. a skirt hung below a long top)
        else { attach.push(v); attachY.push(Math.min(levels[label], positions[3 * v + 1] + 2)); }
      }
    }
  }

  orientTriangles(index, nv, positions, sdf);

  const g = {
    nv,
    positions, flat, uvs, panelOf, kind, seamVert, seamLines: new Uint32Array(seamLines),
    index: nv > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    armpitY: (levels.strapless_top || 130) - 2,
    stretch: new Uint32Array(stretch), stretchRest: new Float32Array(stretchRest), stretchWarp: new Float32Array(stretchWarp),
    grain: Object.fromEntries(panels.map(q => [q.p.name, grains[q.p.name]])),
    bend: new Uint32Array(bend.concat(seamBend)), bendRest: new Float32Array(bendRest.concat(seamBendRest)),
    seamBendCount: seamBend.length / 2, bendWarp: new Float32Array(bendWarp.concat(seamBendWarp)),
    attach: new Uint32Array(attach), attachY: new Float32Array(attachY),
    collar: new Uint32Array(collar), collarX: new Float32Array(collarX),
  };
  if (sdf) projectOut(g, sdf, 1.0, 6, axisOf);
  return g;
}

/**
 * Make triangle winding consistent across the whole welded mesh (seams included) and
 * facing away from the body. GarmentCode gives front and back panels the same normal,
 * so without this the two sides of a seam face opposite ways and the shading breaks.
 */
function orientTriangles(index, nv, x, sdf) {
  const nt = index.length / 3;
  const edgeTris = new Map();
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = index[3 * t + e], b = index[3 * t + (e + 1) % 3];
    const k = a < b ? a * nv + b : b * nv + a;
    const l = edgeTris.get(k);
    if (l) l.push(t); else edgeTris.set(k, [t]);
  }
  const hasDir = (t, a, b) => {   // does triangle t traverse a->b ?
    for (let e = 0; e < 3; e++) if (index[3 * t + e] === a && index[3 * t + (e + 1) % 3] === b) return true;
    return false;
  };
  const flip = (t) => { const tmp = index[3 * t + 1]; index[3 * t + 1] = index[3 * t + 2]; index[3 * t + 2] = tmp; };
  const done = new Uint8Array(nt), comp = new Int32Array(nt).fill(-1);
  const comps = [];
  for (let seed = 0; seed < nt; seed++) {
    if (done[seed]) continue;
    const ci = comps.length, members = [seed];
    done[seed] = 1; comp[seed] = ci;
    for (let q = 0; q < members.length; q++) {
      const t = members[q];
      for (let e = 0; e < 3; e++) {
        const a = index[3 * t + e], b = index[3 * t + (e + 1) % 3];
        for (const u of edgeTris.get(a < b ? a * nv + b : b * nv + a)) {
          if (done[u]) continue;
          if (hasDir(u, a, b)) flip(u);   // neighbour must traverse the shared edge b->a
          done[u] = 1; comp[u] = ci; members.push(u);
        }
      }
    }
    comps.push(members);
  }
  // per connected piece: face away from the body (SDF gradient), or from the vertical axis
  const grad = [0, 0, 0];
  for (const members of comps) {
    let score = 0;
    for (const t of members) {
      const A = 3 * index[3 * t], B = 3 * index[3 * t + 1], C = 3 * index[3 * t + 2];
      const ux = x[B] - x[A], uy = x[B + 1] - x[A + 1], uz = x[B + 2] - x[A + 2];
      const vx = x[C] - x[A], vy = x[C + 1] - x[A + 1], vz = x[C + 2] - x[A + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = (x[A] + x[B] + x[C]) / 3, cy = (x[A + 1] + x[B + 1] + x[C + 1]) / 3, cz = (x[A + 2] + x[B + 2] + x[C + 2]) / 3;
      let ox = cx - BODY_AXIS.c[0], oy = 0, oz = cz - BODY_AXIS.c[2];
      if (sdf && sdf.sample(cx, cy, cz, grad) < 30) { ox = grad[0]; oy = grad[1]; oz = grad[2]; }
      score += Math.sign(nx * ox + ny * oy + nz * oz);
    }
    if (score < 0) for (const t of members) flip(t);
  }
}

/** Collision filter, mirroring GarmentCode: lower garments ignore arms; torso below the armpit too. */
function ignoresArm(kind) { return kind === LEG; }

function projectOut(g, sdf, margin, iters, axisOf = null) {
  const x = g.positions, grad = [0, 0, 0];
  // Deeply buried vertices first move straight out from the axis their panel was wrapped
  // around: the nearest surface can be the far side of a limb, and cloth pushed there ends
  // up wrapped around the wrong side of the leg / arm for the whole drape.
  if (axisOf) for (let v = 0; v < g.nv; v++) {
    const ax = axisOf[v];
    if (!ax) continue;
    const i = 3 * v;
    let d = sdf.sample(x[i], x[i + 1], x[i + 2], grad);
    if (d >= margin || (sdf.lastArm && ignoresArm(g.kind[v]))) continue;
    const [cx, cy, cz] = ax.c, [ax_, ay, az] = ax.a;
    const rx = x[i] - cx, ry = x[i + 1] - cy, rz = x[i + 2] - cz;
    const t = rx * ax_ + ry * ay + rz * az;
    let ux = rx - t * ax_, uy = ry - t * ay, uz = rz - t * az;
    const ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) continue;
    ux /= ul; uy /= ul; uz /= ul;
    for (let k = 0; k < 40 && d < margin; k++) {
      const step = Math.max(0.5, margin - d);
      x[i] += ux * step; x[i + 1] += uy * step; x[i + 2] += uz * step;
      d = sdf.sample(x[i], x[i + 1], x[i + 2], grad);
    }
  }
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < g.nv; v++) {
      const i = 3 * v;
      const d = sdf.sample(x[i], x[i + 1], x[i + 2], grad);
      if (d >= margin) continue;
      if (sdf.lastArm && ignoresArm(g.kind[v], x[i + 1], g.armpitY)) continue;
      const push = margin - d;
      x[i] += grad[0] * push; x[i + 1] += grad[1] * push; x[i + 2] += grad[2] * push;
    }
  }
}

// ---------------------------------------------------------------------------
// Cloth self-collision, after Ten Minute Physics #15 (Matthias Müller, MIT): particles
// keep a minimum distance from each other. Candidate pairs come from a spatial hash
// that is rebuilt every few substeps with a query radius covering the largest
// possible travel in between; mesh neighbours (within two rings) are exempt, and
// pairs that are closer than the thickness in the flat pattern only keep their
// rest distance.
class SelfCollider {
  constructor(g, thickness) {
    const n = g.nv;
    this.n = n; this.th = thickness;
    // 1- and 2-ring neighbourhood (CSR) from the stretch edges
    const deg = new Int32Array(n + 1);
    const E = g.stretch;
    for (let c = 0; c < E.length; c++) deg[E[c]]++;
    const s1 = new Int32Array(n + 1);
    for (let v = 0; v < n; v++) s1[v + 1] = s1[v] + deg[v];
    const a1 = new Int32Array(s1[n]), fill = s1.slice(0, n);
    for (let c = 0; c < E.length; c += 2) { a1[fill[E[c]]++] = E[c + 1]; a1[fill[E[c + 1]]++] = E[c]; }
    const stamp = new Int32Array(n).fill(-1), ring = [], rs = new Int32Array(n + 1);
    for (let v = 0; v < n; v++) {
      stamp[v] = v;
      for (let k = s1[v]; k < s1[v + 1]; k++) {
        const u = a1[k];
        if (stamp[u] !== v) { stamp[u] = v; ring.push(u); }
        for (let m = s1[u]; m < s1[u + 1]; m++) { const w = a1[m]; if (stamp[w] !== v) { stamp[w] = v; ring.push(w); } }
      }
      rs[v + 1] = ring.length;
    }
    this.ringStart = rs; this.ring = new Int32Array(ring);
    this.stampR = new Int32Array(n).fill(-1);
    this.flat = g.flat; this.panelOf = g.panelOf; this.seam = g.seamVert;
    let ts = 1; while (ts < 2 * n) ts <<= 1;
    this.mask = ts - 1;
    this.cellStart = new Int32Array(ts + 1); this.cellEntries = new Int32Array(n); this.cellOf = new Int32Array(n);
    this.cX = new Int32Array(n); this.cY = new Int32Array(n); this.cZ = new Int32Array(n);
    this.xs = new Float32Array(3 * n); this.ck = new Int32Array(3 * n);
    this.pairs = new Int32Array(16 * n); this.minD = new Float32Array(8 * n); this.np = 0;
  }

  _h(xi, yi, zi) { return (Math.imul(xi, 92837111) ^ Math.imul(yi, 689287499) ^ Math.imul(zi, 283923481)) & this.mask; }

  /** Collect all non-neighbour pairs closer than `radius` (cell size = radius). */
  build(x, radius) {
    const n = this.n, inv = 1 / radius, cs = this.cellStart, ce = this.cellEntries, co = this.cellOf;
    const cX = this.cX, cY = this.cY, cZ = this.cZ;
    cs.fill(0);
    for (let v = 0; v < n; v++) {
      const i = Math.floor(x[3 * v] * inv), j = Math.floor(x[3 * v + 1] * inv), k = Math.floor(x[3 * v + 2] * inv);
      cX[v] = i; cY[v] = j; cZ[v] = k;
      const h = this._h(i, j, k);
      co[v] = h; cs[h]++;
    }
    let st = 0;
    for (let i = 0; i <= this.mask; i++) { st += cs[i]; cs[i] = st; }
    cs[this.mask + 1] = st;
    // cell-sorted copies of positions and cell coordinates, so candidate scans are contiguous
    const xs = this.xs, ck = this.ck;
    for (let v = 0; v < n; v++) {
      const e = --cs[co[v]];
      ce[e] = v;
      xs[3 * e] = x[3 * v]; xs[3 * e + 1] = x[3 * v + 1]; xs[3 * e + 2] = x[3 * v + 2];
      ck[3 * e] = cX[v]; ck[3 * e + 1] = cY[v]; ck[3 * e + 2] = cZ[v];
    }
    const r2 = radius * radius, th = this.th, th2 = th * th;
    const sR = this.stampR, rs = this.ringStart, ring = this.ring, OFF = SelfCollider.OFF, mask = this.mask;
    const fl = this.flat, po = this.panelOf, seam = this.seam;
    let np = 0, pairs = this.pairs, minD = this.minD;
    for (let v = 0; v < n; v++) {
      for (let k = rs[v]; k < rs[v + 1]; k++) sR[ring[k]] = v;
      const px = x[3 * v], py = x[3 * v + 1], pz = x[3 * v + 2];
      // half stencil: own cell (u > v) + the 13 "forward" neighbour cells, so each pair
      // is visited once; exact cell coordinates filter out hash collisions
      const vx = cX[v], vy = cY[v], vz = cZ[v];
      for (let o = 0; o < 42; o += 3) {
        const a = vx + OFF[o], b = vy + OFF[o + 1], c = vz + OFF[o + 2];
        const h = (Math.imul(a, 92837111) ^ Math.imul(b, 689287499) ^ Math.imul(c, 283923481)) & mask;
        for (let e = cs[h], end = cs[h + 1]; e < end; e++) {
          if (ck[3 * e] !== a || ck[3 * e + 1] !== b || ck[3 * e + 2] !== c) continue;
          const dx = xs[3 * e] - px, dy = xs[3 * e + 1] - py, dz = xs[3 * e + 2] - pz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const u = ce[e];
          if ((o === 0 && u <= v) || sR[u] === v) continue;
          let md = th;
          if (po[u] === po[v] && !seam[u] && !seam[v]) {
            const fx = fl[3 * u] - fl[3 * v], fy = fl[3 * u + 1] - fl[3 * v + 1], fz = fl[3 * u + 2] - fl[3 * v + 2];
            const rd2 = fx * fx + fy * fy + fz * fz;
            if (rd2 < th2) { if (rd2 < 1e-4) continue; md = Math.sqrt(rd2); }
          }
          if (np * 2 >= pairs.length) {
            const P2 = new Int32Array(pairs.length * 2); P2.set(pairs); pairs = this.pairs = P2;
            const M2 = new Float32Array(minD.length * 2); M2.set(minD); minD = this.minD = M2;
          }
          pairs[2 * np] = v; pairs[2 * np + 1] = u; minD[np] = md; np++;
        }
      }
    }
    this.np = np;
  }

  /** Push close pairs apart; `mu` blends their substep displacement (friction between layers). */
  solve(x, p, mu) {
    const pairs = this.pairs, minD = this.minD;
    let hits = 0;
    for (let k = 0; k < this.np; k++) {
      const a = 3 * pairs[2 * k], b = 3 * pairs[2 * k + 1], md = minD[k];
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= md * md || d2 < 1e-12) continue;
      hits++;
      const d = Math.sqrt(d2), s = 0.5 * (md - d) / d;
      x[a] -= dx * s; x[a + 1] -= dy * s; x[a + 2] -= dz * s;
      x[b] += dx * s; x[b + 1] += dy * s; x[b + 2] += dz * s;
      if (mu > 0) {
        // move both towards their average displacement this substep
        for (let c = 0; c < 3; c++) {
          const va = x[a + c] - p[a + c], vb = x[b + c] - p[b + c], avg = 0.5 * (va + vb);
          x[a + c] += (avg - va) * mu; x[b + c] += (avg - vb) * mu;
        }
      }
    }
    return hits;
  }
}
// own cell first, then the 13 neighbour cells that are lexicographically "after" it
SelfCollider.OFF = (() => {
  const o = [0, 0, 0];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++)
    if (a > 0 || (a === 0 && (b > 0 || (b === 0 && c > 0)))) o.push(a, b, c);
  return new Int32Array(o);
})();

// ---------------------------------------------------------------------------
// Stretch compliance of an edge from its warp share w (see grain.js edgeWarp; w >= 2 marks a
// ribbing edge, w - 2 its warp share): warp / weft / bias of the fabric, or of the rib knit.
function edgeComp(w, o) {
  const cw = o.stretchCompliance;
  if (w >= 2 && o.ribCompliance) return edgeCompliance(w - 2, ...o.ribCompliance);
  return edgeCompliance(w >= 2 ? w - 2 : w, cw, o.weftCompliance ?? cw, o.biasCompliance ?? cw);
}
const compKey = (o) => [o.stretchCompliance, o.weftCompliance, o.biasCompliance, o.ribCompliance].join('|');

// XPBD-style solver: small substeps, stretch + bending distance constraints,
// gentle half-space attachments, body SDF collision with Coulomb-like friction.
export class ClothSim {
  constructor(g, sdf, opts = {}) {
    this.g = g;
    this.sdf = sdf;
    this.x = g.positions;                         // shared with the render geometry
    this.x0 = new Float32Array(g.positions);      // sewn start state
    this.p = new Float32Array(g.nv * 3);
    this.v = new Float32Array(g.nv * 3);
    this.cn = new Float32Array(g.nv * 3);     // last contact normal per vertex
    this.cpush = new Float32Array(g.nv);      // last contact correction depth (0 = no contact)
    this.opts = Object.assign({
      substeps: 12, stretchIters: 2, gravity: 981, thickness: 0.6, friction: 0.5,
      // stretch compliance along the warp; weft / bias default to the same (isotropic cloth)
      bendCompliance: 2e-6, stretchCompliance: 0, weftCompliance: null, biasCompliance: null, damping: 0.8, seamBendFactor: 0.15,
      zeroGravityFrames: 10,                       // as in GarmentCode's sim config
      relaxFrames: 30,                             // momentum-free settling of the sewn start state
      maxVelocity: 250,                            // cm/s clamp (GarmentCode: global_max_velocity)
      attachStiffness: 1, collarStiffness: 0.06, attachFrames: 400, releaseAttachments: false,
      maxDuration: 14, settleSpeed: 2.0, minDuration: 2.0, frictionScale: 1,
      // cloth self-collision (Ten Minute Physics #15)
      floorY: 0, selfCollision: false, selfThickness: 1.4, selfFriction: 0.1, selfMargin: 1.5,
      selfStartFrame: 0,                           // frames before self-collision starts
      selfMinInterval: 3,                          // min substeps between pair rebuilds (cost cap)
      selfMaxPairs: 3,                             // pair budget per particle before giving up
    }, opts);
    this.self = null;   // built on first use, so it can be toggled live
    this.selfMs = 0; this.selfPairs = 0; this.selfBuilds = 0; this.selfTravel = Infinity; this.selfAge = Infinity;
    this.reset();
    this._g = [0, 0, 0];
  }

  reset() {
    this.x.set(this.x0); this.v.fill(0);
    if (this.cpush) this.cpush.fill(0);
    this.t = 0; this.frame = 0; this.settled = false; this.releaseY = null; this.selfTravel = Infinity; this.selfAge = Infinity; this.selfOverload = false;
  }

  get attachEnd() { return this.opts.releaseAttachments ? this.opts.attachFrames / 60 : Infinity; }
  get attached() { return this.t < this.attachEnd; }
  get done() { return this.settled || this.t >= this.opts.maxDuration; }
  get progress() {
    if (this.done) return 1;
    const target = this.opts.releaseAttachments ? this.attachEnd + 3 : 6;
    return Math.min(0.99, this.t / target);
  }

  /** Per-constraint stretch compliance (/dt²) from each edge's angle to its panel's grain. */
  _stretchAlpha(dt) {
    const o = this.opts, g = this.g;
    const key = `${compKey(o)}|${dt}`;
    if (this._alphaKey === key) return this._alpha;
    const n = g.stretchRest.length, w = g.stretchWarp, inv = 1 / (dt * dt);
    const a = this._alpha && this._alpha.length === n ? this._alpha : new Float32Array(n);
    for (let c = 0; c < n; c++) a[c] = edgeComp(w ? w[c] : 1, o) * inv;
    this._alpha = a; this._alphaKey = key;
    return a;
  }

  _solveStretch(idx, rest, alpha) {   // _solveDist with one compliance per constraint
    const x = this.x;
    for (let c = 0; c < idx.length; c += 2) {
      const a = 3 * idx[c], b = 3 * idx[c + 1];
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const corr = (len - rest[c >> 1]) / len / (2 + alpha[c >> 1]);
      x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
      x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
    }
  }

  /**
   * Bending pairs (opposite vertices of two triangles) as [compliance when shorter than
   * flat, compliance when longer] per pair (/dt²). Shorter = the hinge folds: bending
   * stiffness (seams stiffer). Longer than flat can only be in-plane strain, which a
   * woven resists along the threads and gives on the bias: the larger of the bending and
   * the pair's own stretch compliance, so bending pairs don't lock the fabric's shear.
   */
  _bendAlpha(dt) {
    const o = this.opts, g = this.g;
    const key = `${o.bendCompliance}|${o.seamBendFactor}|${compKey(o)}|${dt}`;
    if (this._bendKey === key) return this._bendA;
    const n = g.bendRest.length, k0 = n - (g.seamBendCount || 0), w = g.bendWarp, inv = 1 / (dt * dt);
    const a = this._bendA && this._bendA.length === 2 * n ? this._bendA : new Float32Array(2 * n);
    for (let c = 0; c < n; c++) {
      const lo = o.bendCompliance * (c < k0 ? 1 : o.seamBendFactor) * inv;
      a[2 * c] = lo;
      a[2 * c + 1] = Math.max(lo, w ? edgeComp(w[c], o) * inv : lo);
    }
    this._bendA = a; this._bendKey = key;
    return a;
  }

  _solveBend(idx, rest, alpha) {
    const x = this.x;
    for (let c = 0; c < idx.length; c += 2) {
      const a = 3 * idx[c], b = 3 * idx[c + 1];
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const C = len - rest[c >> 1];
      const corr = C / len / (2 + alpha[C > 0 ? c + 1 : c]);
      x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
      x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
    }
  }

  _solveDist(idx, rest, alpha) {
    const x = this.x;
    for (let c = 0; c < idx.length; c += 2) {
      const a = 3 * idx[c], b = 3 * idx[c + 1];
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const corr = (len - rest[c >> 1]) / len / (2 + alpha);
      x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
      x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
    }
  }

  step(frameDt = 1 / 60) {
    if (this.done) return false;
    const o = this.opts, g = this.g, n = g.nv;
    const dt = frameDt / o.substeps;
    const x = this.x, p = this.p, v = this.v, sdf = this.sdf, grad = this._g;
    const stretchAlpha = this._stretchAlpha(dt);
    const gy = this.frame < Math.max(o.zeroGravityFrames, o.relaxFrames) ? 0 : -o.gravity * dt;
    const damp = Math.max(0, 1 - o.damping * dt);
    for (let sub = 0; sub < o.substeps; sub++) {
      this.t += dt;
      // velocity-level Coulomb friction for vertices that touched the body last substep:
      // it resists sliding (incl. gravity) without fighting the position constraints
      const muV = this.frame < o.relaxFrames + 20 ? 0 : o.friction * o.frictionScale;
      const cn = this.cn, cp = this.cpush, invDt = 1 / dt;
      for (let i = 0, vi = 0; i < 3 * n; i += 3, vi++) {
        p[i] = x[i]; p[i + 1] = x[i + 1]; p[i + 2] = x[i + 2];
        v[i] *= damp; v[i + 1] = v[i + 1] * damp + gy; v[i + 2] *= damp;
        if (muV > 0 && cp[vi] > 0) {
          const nx = cn[i], ny = cn[i + 1], nz = cn[i + 2];
          let vn = v[i] * nx + v[i + 1] * ny + v[i + 2] * nz;
          const tx = v[i] - vn * nx, ty = v[i + 1] - vn * ny, tz = v[i + 2] - vn * nz;
          const vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
          // normal "impulse": what the body pushed back last substep, plus pressing velocity
          const jn = cp[vi] * invDt + Math.max(0, -vn);
          const lim = muV * jn;
          const kk = vt <= lim ? 0 : 1 - lim / vt;
          if (vn < 0) vn = 0;   // don't keep pressing into the body
          v[i] = vn * nx + tx * kk; v[i + 1] = vn * ny + ty * kk; v[i + 2] = vn * nz + tz * kk;
        }
        x[i] += v[i] * dt; x[i + 1] += v[i + 1] * dt; x[i + 2] += v[i + 2] * dt;
      }
      for (let k = 0; k < o.stretchIters; k++) this._solveStretch(g.stretch, g.stretchRest, stretchAlpha);
      // regular bending, then seams (seam allowances make the seam line stiffer than the cloth)
      this._solveBend(g.bend, g.bendRest, this._bendAlpha(dt));

      if (this.t < this.attachEnd) {
        // Waist / strapless lines: a one-sided floor (an edge may settle down to the line, never
        // below it). A soft spring loses against the stiff cloth constraints once a heavy skirt
        // hangs from it, and the whole garment slides off.
        const ak = o.attachStiffness;
        const at = g.attach, ay = g.attachY;
        for (let c = 0; c < at.length; c++) { const i = 3 * at[c] + 1; if (x[i] < ay[c]) x[i] += (ay[c] - x[i]) * ak; }
        const cl = g.collar, cx = g.collarX;
        for (let c = 0; c < cl.length; c++) {
          const i = 3 * cl[c], lim = cx[c];
          if (lim < 0 ? x[i] < lim : x[i] > lim) x[i] += (lim - x[i]) * o.collarStiffness;
        }
      } else if (this.releaseY === null) {
        this.releaseY = this.topY();
      }

      // self-collision before the body, so the body always has the last word
      if (o.selfCollision && !this.selfOverload && this.frame >= o.selfStartFrame) {
        if (!this.self) this.self = new SelfCollider(g, o.selfThickness);
        // Rebuild the candidate pairs once any two particles may have closed in by more
        // than the margin since the last build (tracked from the actual per-substep
        // displacements below), so pairs can't be missed and slow cloth rarely rebuilds.
        if (this.selfTravel > o.selfMargin && this.selfAge >= o.selfMinInterval) {
          const tq = (typeof performance !== 'undefined' ? performance : Date).now();
          this.self.build(x, o.selfThickness + o.selfMargin);
          this.selfTravel = 0; this.selfAge = 0; this.selfBuilds++;
          this.selfPairs = this.self.np;
          // A crumpled, collapsed mesh (e.g. a degenerate pattern) yields huge pair lists
          // that cannot be resolved anyway: give up on self-collision rather than stall.
          if (this.self.np > o.selfMaxPairs * n) { this.selfOverload = true; this.self.np = 0; }
          this.selfMs += (typeof performance !== 'undefined' ? performance : Date).now() - tq;
        }
        this.self.solve(x, p, o.selfFriction);
      }

      // body collision (projection only; friction is applied to velocities above)
      const th = o.thickness;
      for (let vi = 0; vi < n; vi++) {
        const i = 3 * vi;
        const d = sdf.sample(x[i], x[i + 1], x[i + 2], grad);
        if (d >= th + 0.3 || (sdf.lastArm && ignoresArm(g.kind[vi], x[i + 1], g.armpitY))) { cp[vi] = 0; continue; }
        cn[i] = grad[0]; cn[i + 1] = grad[1]; cn[i + 2] = grad[2];
        if (d >= th) { cp[vi] = 1e-4; continue; }     // resting just on the surface: still in contact
        const push = th - d;
        cp[vi] = push;
        x[i] += grad[0] * push; x[i + 1] += grad[1] * push; x[i + 2] += grad[2] * push;
      }
      // floor (the mannequin stands at y = 0): long, full skirts pool on it instead of
      // hanging below the feet and crumpling in mid-air
      const fy = o.floorY + th;
      for (let vi = 0; vi < n; vi++) {
        const i = 3 * vi;
        if (x[i + 1] >= fy) continue;
        const push = fy - x[i + 1];
        x[i + 1] = fy;
        cn[i] = 0; cn[i + 1] = 1; cn[i + 2] = 0;
        cp[vi] = Math.max(cp[vi], push, 1e-4);
      }
      const inv = 1 / dt;
      if (this.self) {
        // two particles can close in by at most the two largest displacements
        let m1 = 0, m2 = 0;
        for (let i = 0; i < 3 * n; i += 3) {
          const dx = x[i] - p[i], dy = x[i + 1] - p[i + 1], dz = x[i + 2] - p[i + 2], s2 = dx * dx + dy * dy + dz * dz;
          if (s2 > m2) { if (s2 > m1) { m2 = m1; m1 = s2; } else m2 = s2; }
        }
        this.selfTravel += Math.sqrt(m1) + Math.sqrt(m2);
        this.selfAge++;
      }
      if (this.frame < o.relaxFrames) { v.fill(0); continue; }
      const vmax2 = o.maxVelocity * o.maxVelocity;
      for (let i = 0; i < 3 * n; i += 3) {
        let vx = (x[i] - p[i]) * inv, vy = (x[i + 1] - p[i + 1]) * inv, vz = (x[i + 2] - p[i + 2]) * inv;
        const s2 = vx * vx + vy * vy + vz * vz;
        if (s2 > vmax2) { const k = o.maxVelocity / Math.sqrt(s2); vx *= k; vy *= k; vz *= k; }
        v[i] = vx; v[i + 1] = vy; v[i + 2] = vz;
      }
    }
    this.frame++;
    if (this.t > Math.max(o.minDuration, this.opts.releaseAttachments ? this.attachEnd + 0.5 : 0)) {
      let vmax = 0;
      for (let i = 0; i < 3 * n; i += 3) vmax = Math.max(vmax, v[i] * v[i] + v[i + 1] * v[i + 1] + v[i + 2] * v[i + 2]);
      if (Math.sqrt(vmax) < o.settleSpeed) this.settled = true;
    }
    return true;
  }

  /** Per-vertex fabric strain (1 = relaxed, >1 stretched/tight, <1 compressed), for the fit map. */
  vertexStrain(out) {
    const g = this.g, x = this.x, n = g.nv;
    const sum = new Float32Array(n), cnt = new Uint16Array(n);
    for (let c = 0; c < g.stretch.length; c += 2) {
      const a = g.stretch[c], b = g.stretch[c + 1];
      const l = Math.hypot(x[3 * a] - x[3 * b], x[3 * a + 1] - x[3 * b + 1], x[3 * a + 2] - x[3 * b + 2]) / (g.stretchRest[c >> 1] || 1);
      sum[a] += l; sum[b] += l; cnt[a]++; cnt[b]++;
    }
    out = out || new Float32Array(n);
    for (let v = 0; v < n; v++) out[v] = cnt[v] ? sum[v] / cnt[v] : 1;
    return out;
  }

  /** Distance of every vertex to the body (cm): small = snug, large = loose. */
  vertexEase(out) {
    const x = this.x, n = this.g.nv;
    out = out || new Float32Array(n);
    for (let v = 0; v < n; v++) out[v] = this.sdf.sample(x[3 * v], x[3 * v + 1], x[3 * v + 2]);
    return out;
  }

  topY() { let m = -Infinity; for (let i = 1; i < this.x.length; i += 3) m = Math.max(m, this.x[i]); return m; }

  /** How far the garment slid after attachments were released (cm). */
  slipAfterRelease() { return this.releaseY === null ? 0 : this.releaseY - this.topY(); }
}
