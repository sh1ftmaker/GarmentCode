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
    this.d = new Int16Array(buffer, 28, u[0] * u[1] * u[2]);
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
/** Build the simulation-ready garment from the exported GarmentCode pattern. */
export function buildGarment(pattern, h) {
  const positions = [], uvs = [], index = [], panelOf = [];
  const offsets = {};
  const rest2D = [];
  pattern.panels.forEach((p, pi) => {
    const { pts, tris } = meshPanel(p.boundary, h);
    const base = positions.length / 3;
    offsets[p.name] = base;
    const R = p.rotation, T = p.translation;
    for (const [x, y] of pts) {
      positions.push(
        R[0][0] * x + R[0][1] * y + T[0],
        R[1][0] * x + R[1][1] * y + T[1],
        R[2][0] * x + R[2][1] * y + T[2]);
      uvs.push(x / 25, y / 25);
      rest2D.push(x, y);
      panelOf.push(pi);
    }
    for (const t of tris) index.push(base + t);
  });

  const nv = positions.length / 3;
  // attachment constraints (vertical), mirroring GarmentCode's simulation setup
  // Attachments, as in GarmentCode's Warp simulation setup (pygarment/meshgen/garment.py):
  //  * lower_interface -> waist level (vertical), strapless_top -> under-arm level (vertical)
  //  * right_collar / left_collar -> x = -/+ neck_w/2 (horizontal)
  // They are soft springs and are released after `attachFrames`, like the original.
  const attach = [], attachY = [], collar = [], collarX = [];
  const levels = pattern.attach_levels || {};
  pattern.panels.forEach((p) => {
    for (const [label, ids] of Object.entries(p.labels || {})) {
      if (!(label in levels)) continue;
      for (const i of new Set(ids)) {
        const v = offsets[p.name] + i;
        if (label.endsWith('_collar')) { collar.push(v); collarX.push(levels[label]); }
        else { attach.push(v); attachY.push(levels[label]); }
      }
    }
  });
  // stretch edges + bending pairs from triangle adjacency
  const edgeMap = new Map();
  const stretch = [], bend = [];
  for (let i = 0; i < index.length; i += 3) {
    const tri = [index[i], index[i + 1], index[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], opp = tri[(e + 2) % 3];
      const key = a < b ? a * nv + b : b * nv + a;
      const prev = edgeMap.get(key);
      if (prev === undefined) { edgeMap.set(key, opp); stretch.push(a, b); }
      else if (prev >= 0) { bend.push(prev, opp); edgeMap.set(key, -1); }
    }
  }
  const restLen = (arr) => {
    const out = new Float32Array(arr.length / 2);
    for (let i = 0; i < arr.length; i += 2) {
      const a = arr[i], b = arr[i + 1];
      out[i / 2] = Math.hypot(rest2D[2 * a] - rest2D[2 * b], rest2D[2 * a + 1] - rest2D[2 * b + 1]);
    }
    return out;
  };

  const seams = [];
  for (const s of pattern.stitches) {
    const oa = offsets[s.a], ob = offsets[s.b];
    if (oa === undefined || ob === undefined) continue;
    for (let k = 0; k < s.ia.length && k < s.ib.length; k++) seams.push(oa + s.ia[k], ob + s.ib[k]);
  }

  return {
    nv,
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    index: nv > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    panelOf: new Uint16Array(panelOf),
    stretch: new Uint32Array(stretch), stretchRest: restLen(stretch),
    bend: new Uint32Array(bend), bendRest: restLen(bend),
    seams: new Uint32Array(seams),
    attach: new Uint32Array(attach), attachY: new Float32Array(attachY),
    collar: new Uint32Array(collar), collarX: new Float32Array(collarX),
  };
}

// ---------------------------------------------------------------------------
export class ClothSim {
  constructor(g, sdf, opts = {}) {
    this.g = g;
    this.sdf = sdf;
    this.x = g.positions;                         // shared with the render geometry
    this.x0 = new Float32Array(g.positions);      // initial (flat, placed) state
    this.p = new Float32Array(g.nv * 3);          // previous positions
    this.v = new Float32Array(g.nv * 3);
    this.opts = Object.assign({
      substeps: 12, gravity: 981, thickness: 0.35, friction: 0.5,
      bendCompliance: 2e-6, sewTime: 1.4, damping: 1.5,
      attachStiffness: 0.02, attachFrames: 400,   // original: 400 frames at 60 fps, then released
      maxDuration: 20, settleSpeed: 1.0,          // stop when max vertex speed (cm/s) is below this
    }, opts);
    const s = g.seams;
    this.seamRest0 = new Float32Array(s.length / 2);
    for (let i = 0; i < s.length; i += 2) {
      const a = 3 * s[i], b = 3 * s[i + 1], x = this.x;
      this.seamRest0[i / 2] = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]);
    }
    this.t = 0;
    this.settled = false;
    this.releaseY = null;   // garment top height when attachments were released
    this._g = [0, 0, 0];
  }

  get attachEnd() { return this.opts.sewTime + this.opts.attachFrames / 60; }
  get attached() { return this.t < this.attachEnd; }
  get done() { return this.settled || this.t >= this.opts.maxDuration; }
  get progress() { return this.done ? 1 : Math.min(0.99, this.t / (this.attachEnd + 3)); }

  reset() {
    this.x.set(this.x0); this.v.fill(0); this.t = 0; this.settled = false; this.releaseY = null;
  }

  _solveDist(idx, rest, alpha, scale = 1) {
    const x = this.x;
    for (let c = 0; c < idx.length; c += 2) {
      const a = 3 * idx[c], b = 3 * idx[c + 1];
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const r = rest[c >> 1] * scale;
      const corr = (len - r) / len / (2 + alpha);
      x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
      x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
    }
  }

  step(frameDt = 1 / 60) {
    if (this.done) return false;
    const o = this.opts, n = this.g.nv;
    const dt = frameDt / o.substeps;
    const x = this.x, p = this.p, v = this.v, sdf = this.sdf, g = this._g;
    const bendAlpha = o.bendCompliance / (dt * dt);
    const s = this.g.seams;
    for (let sub = 0; sub < o.substeps; sub++) {
      this.t += dt;
      // gravity ramps in once the seams are mostly closed
      const gk = Math.min(1, Math.max(0, (this.t - o.sewTime * 0.6) / o.sewTime));
      const gy = -o.gravity * gk * dt;
      const damp = Math.max(0, 1 - o.damping * dt);
      for (let i = 0; i < 3 * n; i += 3) {
        p[i] = x[i]; p[i + 1] = x[i + 1]; p[i + 2] = x[i + 2];
        v[i] *= damp; v[i + 1] = v[i + 1] * damp + gy; v[i + 2] *= damp;
        x[i] += v[i] * dt; x[i + 1] += v[i + 1] * dt; x[i + 2] += v[i + 2] * dt;
      }
      // seams: rest length shrinks to zero during sewTime
      const sewK = Math.max(0, 1 - this.t / o.sewTime);
      for (let c = 0; c < s.length; c += 2) {
        const a = 3 * s[c], b = 3 * s[c + 1];
        const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const r = this.seamRest0[c >> 1] * sewK;
        if (len <= r || len < 1e-9) continue;
        const corr = (len - r) / len * 0.5;
        x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
        x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
      }
      this._solveDist(this.g.stretch, this.g.stretchRest, 0);
      this._solveDist(this.g.bend, this.g.bendRest, bendAlpha);
      // keep waistbands / strapless tops at their body level (vertical only)
      if (this.t < this.attachEnd) {
        const at = this.g.attach, ay = this.g.attachY, ak = o.attachStiffness;
        for (let c = 0; c < at.length; c++) { const i = 3 * at[c] + 1; x[i] += (ay[c] - x[i]) * ak; }
        const cl = this.g.collar, cx = this.g.collarX;
        for (let c = 0; c < cl.length; c++) { const i = 3 * cl[c]; x[i] += (cx[c] - x[i]) * ak; }
      } else if (this.releaseY === null) {
        this.releaseY = this.topY();
      }
      // body collision with simple friction
      const th = o.thickness, fr = o.friction;
      for (let i = 0; i < 3 * n; i += 3) {
        const d = sdf.sample(x[i], x[i + 1], x[i + 2], g);
        if (d < th) {
          const push = th - d;
          x[i] += g[0] * push; x[i + 1] += g[1] * push; x[i + 2] += g[2] * push;
          const mx = x[i] - p[i], my = x[i + 1] - p[i + 1], mz = x[i + 2] - p[i + 2];
          const mn = mx * g[0] + my * g[1] + mz * g[2];
          x[i] -= (mx - mn * g[0]) * fr; x[i + 1] -= (my - mn * g[1]) * fr; x[i + 2] -= (mz - mn * g[2]) * fr;
        }
      }
      const inv = 1 / dt;
      for (let i = 0; i < 3 * n; i++) v[i] = (x[i] - p[i]) * inv;
    }
    // settle detection once attachments are released (the original runs until static too)
    if (this.t > this.attachEnd + 1) {
      let vmax = 0;
      for (let i = 0; i < 3 * n; i += 3) vmax = Math.max(vmax, v[i] * v[i] + v[i + 1] * v[i + 1] + v[i + 2] * v[i + 2]);
      if (Math.sqrt(vmax) < o.settleSpeed) this.settled = true;
    }
    return true;
  }

  topY() { let m = -Infinity; for (let i = 1; i < this.x.length; i += 3) m = Math.max(m, this.x[i]); return m; }

  /** How far the garment slid after attachments were released (cm). */
  slipAfterRelease() { return this.releaseY === null ? 0 : this.releaseY - this.topY(); }
}
