// Builds the collision SDF for a morphed mannequin off the main thread.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';  // same instance three-mesh-bvh's +esm build imports
import { MeshBVH } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.8.3/+esm';
import { buildSDF } from './sdf-core.js';

onmessage = (e) => {
  const { id, pos, idx, isArm, cell } = e.data;
  let last = 0;
  const buf = buildSDF(THREE, MeshBVH, pos, idx, isArm, {
    cell: cell || 2.0, signBand: 12,
    onProgress: (f) => { if (f - last > 0.1) { last = f; postMessage({ id, progress: f }); } },
  });
  postMessage({ id, sdf: buf }, [buf]);
};
