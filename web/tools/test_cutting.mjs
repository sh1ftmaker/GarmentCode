// Self-check for the cutting pipeline (pieces -> layout -> exports), no browser needed:
//   node web/tools/test_cutting.mjs
// Uses a small synthetic pattern: a mirrored pair, a symmetric piece and a strip.
import assert from 'node:assert/strict';
import { buildPieces, cutText } from '../src/pieces.js';
import { autoLayout, findProblems, minGap, layoutLength, fabricToBuy, placed } from '../src/layout.js';
import { primitives, fabricPrims, toSVG, planSheet, PAPERS, toDXF } from '../src/export.js';

const panel = (name, boundary) => ({ name, boundary, edge_ranges: boundary.map((_, i) => [i, (i + 1) % boundary.length]), rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
const front = [[0, 0], [40, 0], [44, 60], [10, 70], [0, 60]];               // asymmetric
const data = {
  panels: [
    panel('left_ftorso', front),
    panel('right_ftorso', front.map(([x, y]) => [-x, y])),                  // mirror image
    panel('skirt_back', [[-30, 0], [30, 0], [22, 50], [-22, 50]]),          // symmetric trapezoid
    panel('wb_front', [[0, 0], [90, 0], [90, 8], [0, 8]]),                  // strip
  ],
  stitches: [{ a: 'left_ftorso', b: 'right_ftorso', ia: [4, 0], ib: [4, 0] }],
};
const set = buildPieces(data, { sa: 0, note: 'Bust 90 cm' });
const g = Object.fromEntries(set.groups.map(x => [x.id, x]));
assert.equal(set.groups.length, 3, 'mirror pair grouped');
assert.equal(cutText(g.left_ftorso), 'Cut 2 (mirrored pair)');
assert.equal(set.pieces.find(p => p.id === 'skirt_back').sym, true, 'trapezoid is symmetric');
assert.equal(cutText(g.skirt_back, { folded: true }), 'Cut 1 on fold');

for (const folded of [false, true]) for (const width of [90, 112, 150]) {
  const L = autoLayout(set, { width, folded, timeBudget: 50 });
  assert.equal(findProblems(set, L).size, 0, `no problems (W${width} folded=${folded})`);
  assert.ok(minGap(set, L) >= 0.5, 'pieces keep a gap');
  const covered = L.items.flatMap(it => it.covers).sort();
  assert.deepEqual(covered, set.pieces.map(p => p.id).sort(), 'every piece is cut exactly once');
  for (const it of L.items) {
    const pts = placed(set.pieces.find(p => p.id === it.piece), it);
    const maxX = Math.max(...pts.map(q => q[0])), minX = Math.min(...pts.map(q => q[0]));
    assert.ok(minX >= -1e-6 && maxX <= (it.region === 'fold' ? width / 2 : width) + 1e-6, 'inside the fabric');
  }
  if (folded && width >= 112) {
    const pair = L.items.find(it => it.covers.includes('left_ftorso'));
    assert.equal(pair.layers, 2, 'mirror pair cut through both layers');
    const fold = L.items.find(it => it.piece === 'skirt_back');
    assert.ok(fold.fold && Math.abs(fold.x + (set.pieces.find(p => p.id === 'skirt_back').bbox[2] - set.pieces.find(p => p.id === 'skirt_back').bbox[0]) / 2) < 1e-6, 'symmetric piece on the fold');
  }
}
// too wide: reported, never overlapping
const wide = autoLayout(set, { width: 45, timeBudget: 0 });
assert.ok(wide.tooWide.includes('skirt_back'), 'piece wider than a 45 cm fabric (either way) is reported');
assert.ok(wide.crossGrain.includes('wb_front'), 'long strip turned cross-grain');
assert.ok(findProblems(set, wide).has('skirt_back') && minGap(set, wide) > 0.4, 'flagged as sticking out, not overlapping');
assert.equal(fabricToBuy(123).m, 1.3);
assert.equal(fabricToBuy(86.44).yd, 1);

// exports at true scale
const L = autoLayout(set, { width: 150, timeBudget: 0 });
const len = Math.ceil(layoutLength(set, L) + 2);
const svg = toSVG([...fabricPrims(set, L, { length: len }), ...primitives(set, L)], 150, len);
assert.match(svg, new RegExp(`viewBox="0 0 150 ${len}" width="150cm" height="${len}cm"`));
const sheet = planSheet(set, { paper: PAPERS.a4, budget: 0 });
assert.equal(sheet.layout.items.length, set.groups.length, 'pattern sheet: one of each piece');
assert.match(toDXF(primitives(set, L)), /\$INSUNITS\n70\n4/);

// grain: bias pieces are turned 45° (outline unchanged), mirror pairs keep mirrored grains
const bias = buildPieces(data, { sa: 0, grain: { all: 'bias', pieces: { wb_front: 'cross' } } });
const byB = Object.fromEntries(bias.pieces.map(p => [p.id, p])), byS = Object.fromEntries(set.pieces.map(p => [p.id, p]));
assert.equal(byB.left_ftorso.grainMode, 'bias');
assert.equal(byB.wb_front.grainMode, 'cross', 'per-piece override');
assert.ok(Math.abs(Math.abs(byB.left_ftorso.grainVec[0]) - Math.SQRT1_2) < 1e-9, 'bias grain at 45°');
assert.ok(Math.abs(byB.left_ftorso.grainVec[0] + byB.right_ftorso.grainVec[0]) < 1e-9, 'mirrored bias on a mirrored pair');
for (const id of Object.keys(byS)) assert.ok(Math.abs(byB[id].area - byS[id].area) < 1e-6, 'rigid turn keeps the area');
assert.ok(bias.groups.some(g => g.count === 2 && g.mirrored === 1), 'bias pair still a mirrored pair');
assert.equal(byB.skirt_back.sym, false, 'a bias piece is not cut on the fold');
const LB = autoLayout(bias, { width: 150, timeBudget: 0 });
assert.equal(findProblems(bias, LB).size, 0, 'bias layout without overlaps');
assert.match(toSVG(primitives(bias, LB), 150, 200), /Cut on the bias/);
console.log('cutting pipeline OK');
