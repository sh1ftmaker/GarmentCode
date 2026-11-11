// Panel meshing and a small XPBD cloth solver that sews GarmentCode panels
// together around the body. All units are centimeters (GarmentCode units).
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';

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

/** Triangulate a panel outline with roughly uniform interior sampling. */
export function meshPanel(boundary, h) {
  const n = boundary.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of boundary) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pts = boundary.map(p => [p[0], p[1]]);
  const keep2 = (0.6 * h) ** 2;
  const dy = h * Math.sqrt(3) / 2;
  let row = 0;
  for (let y = minY + dy / 2; y < maxY; y += dy, row++) {
    for (let x = minX + (row % 2 ? h / 2 : 0); x < maxX; x += h) {
      if (!pointInPolygon(x, y, boundary)) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const a = boundary[i], b = boundary[(i + 1) % n];
        if (distToSegSq(x, y, a[0], a[1], b[0], b[1]) < keep2) ok = false;
      }
      if (ok) pts.push([x, y]);
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
function wrapPanel(P, n0, axis, rMin = 9) {
  const [cx, cy, cz] = axis.c, [ax, ay, az] = axis.a;
  // panel normal made perpendicular to the axis, oriented away from it
  const na = n0[0] * ax + n0[1] * ay + n0[2] * az;
  let nx = n0[0] - na * ax, ny = n0[1] - na * ay, nz = n0[2] - na * az;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 0.7) return false;           // panel not facing the axis (e.g. horizontal pieces)
  nx /= nl; ny /= nl; nz /= nl;
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
  if (dMean < 0) { nx = -nx; ny = -ny; nz = -nz; dMean = -dMean; for (let i = 0; i < cnt; i++) d[i] = -d[i]; }
  if (dMean < 3) return false;
  // tangent = a x n
  const tx = ay * nz - az * ny, ty = az * nx - ax * nz, tz = ax * ny - ay * nx;
  let uMin = Infinity, uMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (let i = 0; i < cnt; i++) {
    const rx = P[3 * i] - cx, ry = P[3 * i + 1] - cy, rz = P[3 * i + 2] - cz;
    u[i] = rx * tx + ry * ty + rz * tz;
    uMin = Math.min(uMin, u[i]); uMax = Math.max(uMax, u[i]);
    tMin = Math.min(tMin, t[i]); tMax = Math.max(tMax, t[i]);
  }
  // only wrap panels that face the axis (e.g. not collar pieces placed off to the side)
  const uc = (uMin + uMax) / 2;
  if (Math.abs(uc) > Math.max(dMean, 12) * 0.9 || uMin > dMean + 5 || uMax < -dMean - 5) return false;
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
  return true;
}

/** Build the simulation-ready garment from the exported GarmentCode pattern. */
export function buildGarment(pattern, h, sdf, { armAxes = null } = {}) {
  // 1. mesh + place every panel
  const panels = pattern.panels.map((p, pi) => {
    const { pts, tris } = meshPanel(p.boundary, h);
    const R = p.rotation, T = p.translation;
    const P = new Float32Array(pts.length * 3);
    pts.forEach(([x, y], i) => {
      P[3 * i] = R[0][0] * x + R[0][1] * y + T[0];
      P[3 * i + 1] = R[1][0] * x + R[1][1] * y + T[1];
      P[3 * i + 2] = R[2][0] * x + R[2][1] * y + T[2];
    });
    const flat = new Float32Array(P);
    const kind = panelKind(p.label);
    const n0 = [R[0][2], R[1][2], R[2][2]];
    if (kind !== ARM) wrapPanel(P, n0, BODY_AXIS);
    else if (armAxes) {   // sleeves: wrap around the arm on the panel's side
      let mx = 0; for (let i = 0; i < P.length; i += 3) mx += P[i];
      const ax = mx >= 0 ? armAxes.pos : armAxes.neg;
      if (ax) wrapPanel(P, n0, ax, 3.5);
    }
    return { p, pi, pts, tris, P, flat, kind };
  });
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
  for (const q of panels) {
    q.pts.forEach(([x, y], i) => {
      const v = remap[q.base + i];
      positions[3 * v] += q.P[3 * i]; positions[3 * v + 1] += q.P[3 * i + 1]; positions[3 * v + 2] += q.P[3 * i + 2];
      flat[3 * v] += q.flat[3 * i]; flat[3 * v + 1] += q.flat[3 * i + 1]; flat[3 * v + 2] += q.flat[3 * i + 2];
      if (cnt[v] === 0) { uvs[2 * v] = x / 25; uvs[2 * v + 1] = y / 25; panelOf[v] = q.pi; kind[v] = q.kind; }
      else { seamVert[v] = 1; kind[v] = Math.min(kind[v], q.kind) === ARM ? ARM : Math.max(kind[v], q.kind); }
      cnt[v]++;
    });
  }
  for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { positions[3 * v + c] /= cnt[v]; flat[3 * v + c] /= cnt[v]; }

  // 3. triangles, stretch edges and bending pairs (rest state from the 2D pattern)
  const index = [], stretch = [], stretchRest = [], bend = [], bendRest = [];
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
          edgeSeen.set(key, { panel: q.pi, opp: loc[(e + 2) % 3], q });
          stretch.push(a, b); stretchRest.push(d2(loc[e], loc[(e + 1) % 3]));
        } else if (prev && prev.panel === q.pi) {
          bend.push(remap[q.base + prev.opp], glob[(e + 2) % 3]);
          bendRest.push(d2(prev.opp, loc[(e + 2) % 3]));
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

  const g = {
    nv,
    positions, flat, uvs, panelOf, kind, seamLines: new Uint32Array(seamLines),
    index: nv > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    armpitY: (levels.strapless_top || 130) - 2,
    stretch: new Uint32Array(stretch), stretchRest: new Float32Array(stretchRest),
    bend: new Uint32Array(bend), bendRest: new Float32Array(bendRest),
    attach: new Uint32Array(attach), attachY: new Float32Array(attachY),
    collar: new Uint32Array(collar), collarX: new Float32Array(collarX),
  };
  if (sdf) projectOut(g, sdf, 1.0, 6);
  return g;
}

/** Collision filter, mirroring GarmentCode: lower garments ignore arms; torso below the armpit too. */
function ignoresArm(kind) { return kind === LEG; }

function projectOut(g, sdf, margin, iters) {
  const x = g.positions, grad = [0, 0, 0];
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
      bendCompliance: 2e-6, stretchCompliance: 0, damping: 0.8,
      zeroGravityFrames: 10,                       // as in GarmentCode's sim config
      relaxFrames: 30,                             // momentum-free settling of the sewn start state
      maxVelocity: 250,                            // cm/s clamp (GarmentCode: global_max_velocity)
      attachStiffness: 0.06, attachFrames: 400, releaseAttachments: false,   // one-sided: only ever lifts
      maxDuration: 14, settleSpeed: 2.0, minDuration: 2.0, frictionScale: 1,
    }, opts);
    this.reset();
    this._g = [0, 0, 0];
  }

  reset() {
    this.x.set(this.x0); this.v.fill(0);
    if (this.cpush) this.cpush.fill(0);
    this.t = 0; this.frame = 0; this.settled = false; this.releaseY = null;
  }

  get attachEnd() { return this.opts.releaseAttachments ? this.opts.attachFrames / 60 : Infinity; }
  get attached() { return this.t < this.attachEnd; }
  get done() { return this.settled || this.t >= this.opts.maxDuration; }
  get progress() {
    if (this.done) return 1;
    const target = this.opts.releaseAttachments ? this.attachEnd + 3 : 6;
    return Math.min(0.99, this.t / target);
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
    const bendAlpha = o.bendCompliance / (dt * dt);
    const stretchAlpha = o.stretchCompliance / (dt * dt);
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
      for (let k = 0; k < o.stretchIters; k++) this._solveDist(g.stretch, g.stretchRest, stretchAlpha);
      this._solveDist(g.bend, g.bendRest, bendAlpha);

      if (this.t < this.attachEnd) {
        const ak = o.attachStiffness;
        const at = g.attach, ay = g.attachY;
        for (let c = 0; c < at.length; c++) { const i = 3 * at[c] + 1; if (x[i] < ay[c]) x[i] += (ay[c] - x[i]) * ak; }
        const cl = g.collar, cx = g.collarX;
        for (let c = 0; c < cl.length; c++) {
          const i = 3 * cl[c], lim = cx[c];
          if (lim < 0 ? x[i] < lim : x[i] > lim) x[i] += (lim - x[i]) * ak;
        }
      } else if (this.releaseY === null) {
        this.releaseY = this.topY();
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
      const inv = 1 / dt;
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
