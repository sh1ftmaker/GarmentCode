// Cutting layout: place pieces on a fabric of given width, grain along the fabric length.
// Fabric coordinates: x across the width (0..W), y along the length (downwards), cm.
// Each piece keeps its grainline (local y) parallel to the selvedge; rotation is 0 or 180°.

const CELL = 0.5;

/** Piece outline in fabric coordinates for a placement {x, y, rot}. */
export function placed(piece, pl, which = 'cut') {
  const pts = which === 'sew' ? piece.sew : piece.cut;
  return pts.map(p => xf(piece, pl, p));
}
export function xf(piece, pl, [px, py]) {
  const [minX, minY, maxX, maxY] = piece.bbox;
  const w = maxX - minX, h = maxY - minY;
  // local (x, y-up) -> fabric (x, y-down), garment top towards the top of the layout
  let x = px - minX, y = maxY - py;
  if (pl.rot === 180) { x = w - x; y = h - y; }
  else if (pl.rot === 90) { const t = x; x = h - y; y = t; }      // cross-grain, only for pieces wider than the fabric
  else if (pl.rot === 270) { const t = x; x = y; y = w - t; }
  return [pl.x + x, pl.y + y];
}
export const pieceSize = (p, rot = 0) => {
  const w = p.bbox[2] - p.bbox[0], h = p.bbox[3] - p.bbox[1];
  return rot === 90 || rot === 270 ? [h, w] : [w, h];
};

function profile(piece, rot) {
  const pl = { x: 0, y: 0, rot };
  const pts = placed(piece, pl);
  const [w] = pieceSize(piece, rot);
  const cols = Math.ceil(w / CELL) + 1;
  const bot = new Float32Array(cols).fill(Infinity), top = new Float32Array(cols).fill(-Infinity);
  for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * CELL;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[0] <= x) === (b[0] <= x)) continue;
      const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      bot[c] = Math.min(bot[c], y); top[c] = Math.max(top[c], y);
    }
  }
  for (let c = 0; c < cols; c++) if (bot[c] === Infinity) { bot[c] = 0; top[c] = -Infinity; }
  return { bot, top, cols };
}

/** Skyline bottom-left packing. Returns { placements, length, tooWide }. */
export function autoLayout(pieces, { width = 150, gap = 1, allowRotate = true } = {}) {
  const W = Math.round(width / CELL);
  const sky = new Float32Array(W).fill(0);
  const order = [...pieces].sort((a, b) => pieceSize(b)[1] * pieceSize(b)[0] - pieceSize(a)[1] * pieceSize(a)[0]);
  const placements = {};
  const tooWide = [];
  const crossGrain = [];
  for (const p of order) {
    let rots = allowRotate ? [0, 180] : [0];
    if (pieceSize(p)[0] > width && pieceSize(p, 90)[0] <= width) { rots = allowRotate ? [90, 270] : [90]; crossGrain.push(p.id); }
    let best = null;
    for (const rot of rots) {
      const pr = profile(p, rot);
      if (pr.cols > W) continue;
      for (let x0 = 0; x0 + pr.cols <= W; x0++) {
        let y = 0;
        for (let c = 0; c < pr.cols; c++) if (pr.top[c] > -Infinity) y = Math.max(y, sky[x0 + c] - pr.bot[c]);
        const h = y + pieceSize(p, rot)[1];
        if (!best || h < best.h - 1e-6 || (Math.abs(h - best.h) < 1e-6 && x0 < best.x0)) best = { x0, y, rot, h, pr };
      }
    }
    if (!best) {   // wider than the fabric: place on its own row, flagged
      tooWide.push(p.id);
      const y = Math.max(...sky);
      placements[p.id] = { x: 0, y: y + gap, rot: 0 };
      sky.fill(y + gap + pieceSize(p)[1] + gap);
      continue;
    }
    placements[p.id] = { x: best.x0 * CELL, y: best.y, rot: best.rot };
    for (let c = 0; c < best.pr.cols; c++) {
      if (best.pr.top[c] === -Infinity) continue;
      for (let d = -2; d <= 2; d++) {   // spread the gap sideways too
        const k = best.x0 + c + d;
        if (k >= 0 && k < W) sky[k] = Math.max(sky[k], best.y + best.pr.top[c] + gap);
      }
    }
  }
  return { placements, length: layoutLength(pieces, placements), width, tooWide, crossGrain };
}

export function layoutLength(pieces, placements) {
  let L = 0;
  for (const p of pieces) { const pl = placements[p.id]; if (pl) L = Math.max(L, pl.y + pieceSize(p, pl.rot)[1]); }
  return L;
}

/** Ids of pieces that overlap another piece or stick out of the fabric. */
export function findProblems(pieces, placements, width) {
  const CL = window.ClipperLib;
  const bad = new Set();
  const polys = pieces.map(p => ({ id: p.id, pts: placed(p, placements[p.id]) }));
  const boxes = polys.map(({ pts }) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]));
  polys.forEach((p, i) => { if (boxes[i][0] < -0.01 || boxes[i][2] > width + 0.01 || boxes[i][1] < -0.01) bad.add(p.id); });
  if (!CL) return bad;
  const S = 100;
  const toPath = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
    const c = new CL.Clipper();
    c.AddPath(toPath(polys[i].pts), CL.PolyType.ptSubject, true);
    c.AddPath(toPath(polys[j].pts), CL.PolyType.ptClip, true);
    const sol = new CL.Paths();
    c.Execute(CL.ClipType.ctIntersection, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    const area = sol.reduce((s, p) => s + Math.abs(CL.Clipper.Area(p)), 0) / (S * S);
    if (area > 0.5) { bad.add(polys[i].id); bad.add(polys[j].id); }
  }
  return bad;
}
