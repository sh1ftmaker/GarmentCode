// Converts GarmentCode body OBJs into compact binaries for the web configurator:
//   body_<name>.bin : [nv u32][nf u32][pos f32 * 3nv (cm)][idx u32 * 3nf]
//   sdf_<name>.bin  : [min xyz f32][cell f32][nx ny nz u32][dist int16 * N (mm, signed)][armMask u8 * N]
//   armMask = 1 where the closest body surface belongs to an arm (from ggg_body_segmentation.json),
//   used to mirror GarmentCode's collision filter (skirt/pants panels ignore the arms).
// Usage: node tools/prepare_bodies.mjs <repo_root> <out_dir>
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const [repo, outDir] = process.argv.slice(2);
const BODIES = { neutral: 'mean_all.obj', female: 'mean_female.obj', male: 'mean_male.obj' };
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
  fs.writeFileSync(path.join(outDir, `body_${name}.bin`),
    Buffer.concat([Buffer.from(head.buffer), Buffer.from(pos.buffer), Buffer.from(idx.buffer)]));

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeBoundingBox();
  const bvh = new MeshBVH(geom);
  const bb = geom.boundingBox;
  const min = bb.min.clone().subScalar(MARGIN);
  const size = bb.max.clone().addScalar(MARGIN).sub(min);
  const nx = Math.ceil(size.x / CELL) + 1, ny = Math.ceil(size.y / CELL) + 1, nz = Math.ceil(size.z / CELL) + 1;
  const dist = new Int16Array(nx * ny * nz);
  const armMask = new Uint8Array(nx * ny * nz);
  const isArmV = new Uint8Array(nv);
  for (const k of ['left_arm', 'right_arm']) for (const v of seg[k]) isArmV[v] = 1;

  const p = new THREE.Vector3();
  const ray = new THREE.Ray();
  const dirs = [new THREE.Vector3(1, 0.013, 0.007).normalize(),
                new THREE.Vector3(-0.011, 1, 0.017).normalize(),
                new THREE.Vector3(0.009, -0.006, 1).normalize()];
  const target = {};
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    p.set(min.x + i * CELL, min.y + j * CELL, min.z + k * CELL);
    bvh.closestPointToPoint(p, target);
    let d = target.distance;
    // three-mesh-bvh reorders the index buffer, so map the face back through the BVH-ordered index
    const fi = target.faceIndex;
    const ia = geom.index.array;
    const armVotes = isArmV[ia[3 * fi]] + isArmV[ia[3 * fi + 1]] + isArmV[ia[3 * fi + 2]];
    armMask[i + nx * (j + ny * k)] = armVotes >= 2 ? 1 : 0;
    if (d < 25) {  // sign only matters near the surface
      let inside = 0;
      for (const dir of dirs) {
        ray.origin.copy(p); ray.direction.copy(dir);
        const hits = bvh.raycast(ray, THREE.DoubleSide);
        if (hits.length % 2 === 1) inside++;
      }
      if (inside >= 2) d = -d;
    }
    dist[i + nx * (j + ny * k)] = Math.max(-32000, Math.min(32000, Math.round(d * 10)));
  }
  const hf = new Float32Array([min.x, min.y, min.z, CELL]);
  const hu = new Uint32Array([nx, ny, nz]);
  fs.writeFileSync(path.join(outDir, `sdf_${name}.bin`),
    Buffer.concat([Buffer.from(hf.buffer), Buffer.from(hu.buffer), Buffer.from(dist.buffer), Buffer.from(armMask.buffer)]));
  console.log(`${name}: ${nv} verts, ${nf} faces, sdf ${nx}x${ny}x${nz} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
