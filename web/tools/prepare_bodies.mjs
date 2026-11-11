// Converts GarmentCode body OBJs into compact binaries for the web configurator:
//   body_<name>.bin : [nv u32][nf u32][pos f32 * 3nv (cm)][idx u32 * 3nf][part u8 * nv]
//     part: 0 body, 1 left_arm, 2 right_arm, 3 left_leg, 4 right_leg, 5 face_internal
//   body_<name>.json: GarmentCode body measurements of that preset (from assets/bodies/*.yaml)
//   sdf_<name>.bin  : [min xyz f32][cell f32][nx ny nz u32][dist int16 * N (mm, signed)][armMask u8 * N]
//   armMask = 1 where the closest body surface belongs to an arm (from ggg_body_segmentation.json),
//   used to mirror GarmentCode's collision filter (skirt/pants panels ignore the arms).
// Usage: node tools/prepare_bodies.mjs <repo_root> <out_dir>
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildSDF } from '../src/sdf-core.js';

const [repo, outDir] = process.argv.slice(2);
const BODIES = { neutral: 'mean_all.obj', female: 'mean_female.obj', male: 'mean_male.obj' };
const PARTS = ['body', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'face_internal'];
const CELL = 1.5;   // cm
const MARGIN = 12;  // cm

fs.mkdirSync(outDir, { recursive: true });
const seg = JSON.parse(fs.readFileSync(path.join(repo, 'assets/bodies/ggg_body_segmentation.json'), 'utf8'));

function parseObj(text) {
  const pos = [], idx = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(+x * 100, +y * 100, +z * 100);  // meters -> cm (pattern units)
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map(s => parseInt(s.split('/')[0]) - 1);
      for (let i = 1; i + 1 < f.length; i++) idx.push(f[0], f[i], f[i + 1]);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

for (const [name, file] of Object.entries(BODIES)) {
  const t0 = Date.now();
  const { pos, idx } = parseObj(fs.readFileSync(path.join(repo, 'assets/bodies', file), 'utf8'));
  const nv = pos.length / 3, nf = idx.length / 3;

  const head = new Uint32Array([nv, nf]);
  const part = new Uint8Array(nv);
  PARTS.forEach((k, pi) => { if (pi) for (const v of seg[k]) part[v] = pi; });
  fs.writeFileSync(path.join(outDir, `body_${name}.bin`),
    Buffer.concat([Buffer.from(head.buffer), Buffer.from(pos.buffer), Buffer.from(idx.buffer), Buffer.from(part.buffer)]));
  // measurements (simple "key: value" yaml)
  const meas = {};
  for (const line of fs.readFileSync(path.join(repo, 'assets/bodies', file.replace('.obj', '.yaml')), 'utf8').split('\n')) {
    const m = line.match(/^\s+([a-z_]+):\s*([-0-9.eE]+)\s*$/);
    if (m) meas[m[1]] = +m[2];
  }
  fs.writeFileSync(path.join(outDir, `body_${name}.json`), JSON.stringify(meas));

  const isArmV = new Uint8Array(nv);
  for (const k of ['left_arm', 'right_arm']) for (const v of seg[k]) isArmV[v] = 1;
  const sdfBuf = buildSDF(THREE, MeshBVH, pos, idx, isArmV, { cell: CELL, margin: MARGIN });
  fs.writeFileSync(path.join(outDir, `sdf_${name}.bin`), Buffer.from(sdfBuf));
  console.log(`${name}: ${nv} verts, ${nf} faces, sdf ${new Uint32Array(sdfBuf, 16, 3).join("x")} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
