// Placement helpers for bands sewn round the leg openings of FreeSewing trousers (cuffs,
// legbands) and for waistbands that start somewhere other than the centre front. Used by
// paco.js, percy.js, cornelius.js. Conventions as in lower.js: world cm, y up, the body
// faces +z, the wearer's left is +x; pieces in local cm with y up.

/**
 * A closed 3D ring through the hem of one leg: segs = [[map, [x0, y0], [x1, y1]], ...], each
 * a straight hem edge of a leg piece (local coordinates) and that piece's (x, y) -> 3D map,
 * in the order the band is sewn on. Returns { at(f) -> [x, y, z], len } with f in 0..1 along
 * the ring by arc length, and centre [cx, cz].
 */
export function hemRing(segs, n = 24) {
  const pts = [];
  for (const [map, a, b] of segs) {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push(map(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  pts.push(pts[0]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1];
  let cx = 0, cz = 0;
  for (let i = 0; i < pts.length - 1; i++) { cx += pts[i][0]; cz += pts[i][2]; }
  cx /= pts.length - 1; cz /= pts.length - 1;
  const at = (f) => {
    const s = (((f % 1) + 1) % 1) * L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1), p = pts[lo], q = pts[hi];
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  };
  return { at, len: L, cx, cz };
}

/**
 * A band hanging from a ring (a cuff below a hem): (u, v) -> 3D, u = cm along the band
 * (0..len, the whole ring), v = cm away from the ring (dir = -1: down, +1: up), out = extra
 * clearance off the ring outwards. Meant to be snapped onto the hem it is sewn to (`follow`).
 */
export function ringBand(ring, len, { dir = -1, out = 0.3 } = {}) {
  return (u, v) => {
    const p = ring.at(u / len);
    let nx = p[0] - ring.cx, nz = p[2] - ring.cz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    return [p[0] + out * nx, p[1] + dir * v, p[2] + out * nz];
  };
}
