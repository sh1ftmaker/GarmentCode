// Signed distance field of a body mesh + "closest surface is an arm" mask.
// Shared by tools/prepare_bodies.mjs (Node) and src/sdf-worker.js (browser).
// Output layout: [min xyz f32][cell f32][nx ny nz u32][dist int16 * N (mm)][armMask u8 * N]
export function buildSDF(THREE, MeshBVH, pos, idx, isArmV, { cell = 1.5, margin = 12, signBand = 25, onProgress } = {}) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geom.computeBoundingBox();
  const bvh = new MeshBVH(geom);
  const bb = geom.boundingBox;
  const min = bb.min.clone().subScalar(margin);
  const size = bb.max.clone().addScalar(margin).sub(min);
  const nx = Math.ceil(size.x / cell) + 1, ny = Math.ceil(size.y / cell) + 1, nz = Math.ceil(size.z / cell) + 1;
  const N = nx * ny * nz;
  const out = new ArrayBuffer(28 + 2 * N + N + ((2 * N + N) % 4 ? 4 - ((2 * N + N) % 4) : 0));
  new Float32Array(out, 0, 4).set([min.x, min.y, min.z, cell]);
  new Uint32Array(out, 16, 3).set([nx, ny, nz]);
  const dist = new Int16Array(out, 28, N);
  const armMask = new Uint8Array(out, 28 + 2 * N, N);
  const ia = geom.index.array;   // BVH-reordered index
  const p = new THREE.Vector3(), ray = new THREE.Ray(), target = {};
  const dirs = [new THREE.Vector3(1, 0.013, 0.007).normalize(),
                new THREE.Vector3(-0.011, 1, 0.017).normalize(),
                new THREE.Vector3(0.009, -0.006, 1).normalize()];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      p.set(min.x + i * cell, min.y + j * cell, min.z + k * cell);
      bvh.closestPointToPoint(p, target);
      let d = target.distance;
      const fi = target.faceIndex;
      const o = i + nx * (j + ny * k);
      armMask[o] = (isArmV[ia[3 * fi]] + isArmV[ia[3 * fi + 1]] + isArmV[ia[3 * fi + 2]]) >= 2 ? 1 : 0;
      if (d < signBand) {
        let inside = 0;
        for (const dir of dirs) {
          ray.origin.copy(p); ray.direction.copy(dir);
          if (bvh.raycast(ray, THREE.DoubleSide).length % 2 === 1) inside++;
        }
        if (inside >= 2) d = -d;
      }
      dist[o] = Math.max(-32000, Math.min(32000, Math.round(d * 10)));
    }
    if (onProgress) onProgress((k + 1) / nz);
  }
  return out;
}
