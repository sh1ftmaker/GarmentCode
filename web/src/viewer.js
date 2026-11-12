// three.js stage: mannequin, garment, lighting, materials, fit map, captures.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) {
      console.warn('WebGL unavailable', e);
      const msg = document.createElement('div');
      msg.className = 'no-webgl';
      msg.textContent = 'Your browser could not start WebGL, so the 3D view is unavailable. Pattern tools and exports still work.';
      canvas.parentElement.appendChild(msg);
      return;
    }
    this.ok = true;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.88;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 1000;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.resetCamera();

    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(140, 280, 200);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -110, right: 110, top: 220, bottom: -10, near: 20, far: 800 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.0);
    rim.position.set(-220, 180, -220);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 0.5));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 72), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xb9b0a4, roughness: 0.68, metalness: 0 });
    this.garmentMat = new THREE.MeshPhysicalMaterial({
      color: 0xc9d6ea, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
    });
    this.seamMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
    this.setPrint('plain');

    this.bodyMesh = null;
    this.garment = null;
    this.fitMode = false;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.onFrame = null;
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.turntable) this.turntable();
      this.controls.update();
      if (this.onFrame) this.onFrame();
      r.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    if (!this.ok) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / Math.max(1, rect.height);
    this.camera.updateProjectionMatrix();
  }

  resetCamera() {
    this.camera.position.set(110, 140, 360);
    this.controls.target.set(0, 100, 0);
    this.controls.update();
  }

  // ---------------- mannequin
  setBody(pos, idx) {
    if (!this.ok) return;
    if (!this.bodyMesh || this.bodyMesh.geometry.index.count !== idx.length) {
      if (this.bodyMesh) { this.scene.remove(this.bodyMesh); this.bodyMesh.geometry.dispose(); }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      this.bodyMesh = new THREE.Mesh(geom, this.bodyMat);
      this.bodyMesh.castShadow = this.bodyMesh.receiveShadow = true;
      this.bodyMesh.visible = this.bodyVisible !== false;
      this.scene.add(this.bodyMesh);
    } else {
      this.bodyMesh.geometry.attributes.position.array.set(pos);
      this.bodyMesh.geometry.attributes.position.needsUpdate = true;
    }
    this.bodyMesh.geometry.computeVertexNormals();
    this.bodyMesh.geometry.computeBoundingSphere();
  }
  showBody(v) { this.bodyVisible = v; if (this.bodyMesh) this.bodyMesh.visible = v; }

  // ---------------- garment
  setGarment(g) {
    if (!this.ok) return;
    this.clearGarment();
    if (!g) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(g.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.nv * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
    geom.setIndex(new THREE.BufferAttribute(g.index, 1));
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, this.garmentMat);
    mesh.castShadow = mesh.receiveShadow = true;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', geom.attributes.position);
    lg.setIndex(new THREE.BufferAttribute(g.seamLines, 1));
    const lines = new THREE.LineSegments(lg, this.seamMat);
    lines.renderOrder = 1;
    this.scene.add(mesh, lines);
    this.garment = { mesh, lines, g };
  }
  clearGarment() {
    if (!this.garment) return;
    this.scene.remove(this.garment.mesh, this.garment.lines);
    this.garment.mesh.geometry.dispose();
    this.garment.lines.geometry.dispose();
    this.garment = null;
  }
  garmentUpdated() {
    if (!this.garment) return;
    const geom = this.garment.mesh.geometry;
    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
  }

  // ---------------- fit map
  setFitMode(on) {
    this.fitMode = on;
    this.garmentMat.vertexColors = on;
    this.garmentMat.map = on ? null : this.printTex;
    this.garmentMat.color.set(on ? 0xffffff : this.fabricColor || 0xc9d6ea);
    this.garmentMat.needsUpdate = true;
  }
  /** strain: per-vertex stretch ratio, ease: distance to body (cm) */
  updateFitColors(strain, ease) {
    if (!this.garment) return;
    const col = this.garment.mesh.geometry.attributes.color;
    const a = col.array, c = new THREE.Color();
    const stops = [[0, 0x4c7bd9], [0.45, 0x4fae7a], [0.7, 0xf0c34a], [1, 0xe0503c]];
    for (let v = 0; v < strain.length; v++) {
      // tightness: stretched cloth, or cloth pressed against the body
      const tight = Math.max(0, Math.min(1, (strain[v] - 1) * 12 + 0.55 - Math.min(ease[v], 6) / 12));
      let i = 1; while (i < stops.length - 1 && tight > stops[i][0]) i++;
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      c.setHex(c0).lerp(new THREE.Color(c1), (tight - t0) / (t1 - t0));
      a[3 * v] = c.r; a[3 * v + 1] = c.g; a[3 * v + 2] = c.b;
    }
    col.needsUpdate = true;
  }

  // ---------------- materials
  setFabric(f, color) {
    this.fabricColor = color;
    const m = this.garmentMat;
    if (!this.fitMode) m.color.set(color);
    m.roughness = f.roughness;
    m.sheen = f.sheen;
    m.transparent = (f.opacity || 1) < 1;
    m.opacity = f.opacity || 1;
    m.needsUpdate = true;
  }
  setPrint(kind) {
    const size = 256, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size);
    const weave = (step, dark) => {
      for (let i = 0; i < size; i += step) {
        x.fillStyle = `rgba(0,0,0,${dark})`; x.fillRect(i, 0, 1, size);
        x.fillStyle = `rgba(0,0,0,${dark * 0.7})`; x.fillRect(0, i, size, 1);
      }
    };
    if (kind === 'twill') {
      x.strokeStyle = 'rgba(0,0,0,0.10)'; x.lineWidth = 2;
      for (let i = -size; i < size * 2; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + size, size); x.stroke(); }
    } else weave(4, 0.05);
    if (kind === 'stripes') { x.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < size; i += 64) x.fillRect(i, 0, 22, size); }
    if (kind === 'gingham') {
      x.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < size; i += 64) { x.fillRect(i, 0, 32, size); x.fillRect(0, i, size, 32); }
    }
    if (kind === 'dots') {
      x.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < size; i += 64) for (let j = 0; j < size; j += 64) {
        x.beginPath(); x.arc(i + 16 + ((j / 64) % 2) * 32, j + 16, 9, 0, Math.PI * 2); x.fill();
      }
    }
    if (this.printTex) this.printTex.dispose();
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.repeat.set(kind === 'plain' || kind === 'twill' ? 4 : 1, kind === 'plain' || kind === 'twill' ? 4 : 1);
    this.printTex = t;
    if (!this.fitMode) { this.garmentMat.map = t; this.garmentMat.needsUpdate = true; }
  }

  // ---------------- captures
  thumbnail(w = 240, h = 300) {
    if (!this.ok) return '';
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const s = Math.max(w / src.width, h / src.height);
    ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
    return cv.toDataURL('image/jpeg', 0.8);
  }
  screenshotBlob() {
    return new Promise(res => { this.renderer.render(this.scene, this.camera); this.renderer.domElement.toBlob(res, 'image/png'); });
  }
  async recordTurntable(seconds = 6) {
    const stream = this.canvas.captureStream(30);
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('Video recording is not supported in this browser.');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const start = performance.now();
    const target = this.controls.target.clone();
    const rad = Math.hypot(this.camera.position.x - target.x, this.camera.position.z - target.z);
    const y = this.camera.position.y, a0 = Math.atan2(this.camera.position.x - target.x, this.camera.position.z - target.z);
    this.turntable = () => {
      const t = (performance.now() - start) / 1000 / seconds;
      const a = a0 + t * Math.PI * 2;
      this.camera.position.set(target.x + rad * Math.sin(a), y, target.z + rad * Math.cos(a));
      this.camera.lookAt(target);
    };
    rec.start();
    await new Promise(r => setTimeout(r, seconds * 1000));
    this.turntable = null;
    rec.stop();
    await new Promise(r => { rec.onstop = r; });
    return { blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
  }
  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const group = new THREE.Group();
    if (this.garment) {
      const m = this.garment.mesh.clone();
      m.material = new THREE.MeshStandardMaterial({ color: this.garmentMat.color, roughness: this.garmentMat.roughness, side: THREE.DoubleSide, map: this.printTex });
      m.scale.setScalar(0.01);   // cm -> m
      m.name = 'garment';
      group.add(m);
    }
    if (this.bodyMesh && this.bodyVisible !== false) {
      const b = this.bodyMesh.clone();
      b.scale.setScalar(0.01); b.name = 'mannequin';
      group.add(b);
    }
    const exporter = new GLTFExporter();
    const data = await exporter.parseAsync(group, { binary: true });
    return new Blob([data], { type: 'model/gltf-binary' });
  }
}
