/* BEACON project page — scroll-driven Franka Panda.
 *
 * The arm, props and task choreography are ported from the promotional film's
 * renderer (demo_video, engine.mjs). Meshes are the robosuite Panda visuals,
 * decimated for the web; joint trajectories are the film's baked IK solutions,
 * subsampled. Scroll position in the "How it works" section selects the task
 * and scrubs the motion. Nothing here is a learned-policy rollout.
 */
import * as THREE from './assets/vendor/three.module.min.js';

const canvas = document.getElementById('robot-canvas');
const stage = canvas && canvas.closest('.stage-sticky');
const steps = Array.from(document.querySelectorAll('.step[data-task]'));
const hudTask = document.getElementById('hud-task');
const hudBar = document.getElementById('hud-bar');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fail(msg) {
  if (!stage) return;
  stage.classList.add('is-failed');
  const note = document.createElement('div');
  note.className = 'stage-fallback';
  note.textContent = msg;
  stage.appendChild(note);
  if (canvas) canvas.style.display = 'none';
  console.warn('[BEACON robot]', msg);
}

if (!canvas || !steps.length) {
  // Nothing to drive.
} else {
  main().catch((err) => fail('The 3D arm could not be loaded here. ' + (err && err.message ? err.message : '')));
}

async function main() {
  /* ── Renderer, scene, lights ─────────────────────────────── */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL is not available.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.97;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 40);
  camera.up.set(0, 0, 1);

  const hemi = new THREE.HemisphereLight('#fffdf7', '#767982', 1.35);
  hemi.position.set(0, 0, 5); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff7ef', 3.45);
  key.position.set(0.6, -1.8, 3.1); key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.1, far: 6 });
  key.shadow.normalBias = 0.0015; key.shadow.bias = -0.00015; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight('#d5dfee', 1.4); rim.position.set(-1.1, 1.8, 2); scene.add(rim);
  const fill = new THREE.DirectionalLight('#ead6d5', 0.35); fill.position.set(1.7, 0.4, 1); scene.add(fill);

  /* ── Helpers (ported) ────────────────────────────────────── */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const mix = (a, b, p) => a + (b - a) * p;
  const at = (t, a, b) => clamp((t - a) / (b - a));
  const V = (a) => new THREE.Vector3(...a);
  const mat = (color, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const materials = {
    white: mat('#f4f4f0', 0.30, 0.08), black: mat('#202329', 0.45, 0.18), metal: mat('#aeb6bc', 0.23, 0.7),
    crimson: mat('#a51c30', 0.36, 0.08), wood: mat('#a97c58', 0.6), woodLight: mat('#ccb79a', 0.57),
    blue: mat('#647892', 0.45, 0.1), dark: mat('#272b33', 0.6, 0.08), plate: mat('#cfd3d8', 0.73, 0.02),
  };

  function mesh(geometry, material, parent = scene) {
    const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, dims, pos, material, bevel = 0.003) {
    const [w, d, h] = dims, b = Math.min(bevel, w / 5, d / 5, h / 5);
    const sh = new THREE.Shape(); const x = -w / 2, y = -d / 2;
    sh.moveTo(x + b, y); sh.lineTo(x + w - b, y); sh.quadraticCurveTo(x + w, y, x + w, y + b); sh.lineTo(x + w, y + d - b);
    sh.quadraticCurveTo(x + w, y + d, x + w - b, y + d); sh.lineTo(x + b, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - b);
    sh.lineTo(x, y + b); sh.quadraticCurveTo(x, y, x + b, y);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, steps: 1, curveSegments: 6 });
    g.translate(0, 0, -h / 2 + b);
    const m = mesh(g, material, parent); m.position.set(...pos); return m;
  }
  function cyl(parent, r, h, pos, material) {
    const m = mesh(new THREE.CylinderGeometry(r, r, h, 40), material, parent); m.rotation.x = Math.PI / 2; m.position.set(...pos); return m;
  }
  function tube(parent, pts, r, material) {
    const path = new THREE.CatmullRomCurve3(pts.map(V)); return mesh(new THREE.TubeGeometry(path, 40, r, 10, false), material, parent);
  }

  /* ── Studio: shadow-catching floor and the stage plate ───── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.14 }));
  floor.position.z = -0.053; floor.receiveShadow = true; scene.add(floor);
  const plate = box(scene, [1.26, 1.05, 0.05], [0.34, 0, -0.027], materials.plate, 0.022);
  plate.castShadow = false;

  /* ── Panda ───────────────────────────────────────────────── */
  const [manifest, bin, motion] = await Promise.all([
    fetch('assets/model/panda-web.json').then((r) => r.json()),
    fetch('assets/model/panda-web.bin').then((r) => r.arrayBuffer()),
    fetch('assets/model/motion-web.json').then((r) => r.json()),
  ]);
  const geometries = {};
  for (const [name, s] of Object.entries(manifest.geometries)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, s.offset, s.nv * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, s.offset + s.nv * 12, s.nf * 3), 1));
    g.computeVertexNormals();
    geometries[name] = g;
  }
  const panda = new THREE.Group(); scene.add(panda);
  const joints = []; let parent = panda;
  for (let i = 0; i < manifest.links.length; i++) {
    const spec = manifest.links[i], origin = new THREE.Group();
    origin.position.set(...spec.position);
    const [w, x, y, z] = spec.quaternion; origin.quaternion.set(x, y, z, w).normalize(); parent.add(origin);
    const joint = new THREE.Group(); origin.add(joint); if (i) joints.push(joint);
    for (const part of spec.meshes) {
      const rgb = part.color; let material;
      if (Math.max(...rgb) - Math.min(...rgb) < 0.08) material = Math.max(...rgb) > 0.65 ? materials.white : materials.black;
      else material = mat(new THREE.Color(...rgb), 0.45, 0.1);
      mesh(geometries[part.geometry], material, joint);
    }
    parent = joint;
  }
  const hand = new THREE.Group(); hand.position.z = 0.107; hand.rotation.z = -Math.PI / 4; parent.add(hand);
  mesh(geometries.hand_vis, materials.white, hand);
  const fingers = [];
  for (const sign of [1, -1]) {
    const f = mesh(geometries.finger_vis, materials.black, hand);
    f.position.set(0, sign * 0.03, 0.0584); if (sign < 0) f.rotation.z = Math.PI; fingers.push(f);
  }
  const status = mesh(new THREE.TorusGeometry(0.026, 0.0015, 8, 48), new THREE.MeshBasicMaterial({ color: '#a51c30' }), hand);
  status.position.z = -0.005; status.castShadow = false;

  /* ── Props per task (ported from the film) ───────────────── */
  const groups = {};
  for (const task of ['stack', 'mug', 'thread', 'ball']) { const g = new THREE.Group(); scene.add(g); groups[task] = g; }

  const upper = box(groups.stack, [0.05, 0.05, 0.05], [0, 0, 0], materials.crimson, 0.003);
  box(groups.stack, [0.068, 0.068, 0.06], [0.57, 0.10, 0.03], materials.blue, 0.003);

  const cabinet = new THREE.Group(); cabinet.position.set(0.54, 0.15, 0); groups.mug.add(cabinet);
  for (const side of [-1, 1]) box(cabinet, [0.017, 0.28, 0.175], [side * 0.128, 0, 0.0875], materials.woodLight, 0.002);
  box(cabinet, [0.25, 0.017, 0.175], [0, 0.132, 0.0875], materials.woodLight, 0.002);
  box(cabinet, [0.25, 0.28, 0.014], [0, 0, 0.007], materials.wood, 0.002);
  box(cabinet, [0.27, 0.28, 0.014], [0, 0, 0.178], materials.woodLight, 0.002);
  const drawer = new THREE.Group(); cabinet.add(drawer);
  box(drawer, [0.234, 0.25, 0.013], [0, -0.007, 0.026], materials.wood, 0.002);
  box(drawer, [0.248, 0.018, 0.148], [0, -0.139, 0.085], materials.woodLight, 0.002);
  for (const s of [-1, 1]) box(drawer, [0.011, 0.235, 0.072], [s * 0.115, -0.01, 0.062], materials.wood, 0.001);
  box(drawer, [0.24, 0.011, 0.072], [0, 0.10, 0.062], materials.wood, 0.001);
  tube(drawer, [[-0.06, -0.148, 0.105], [-0.06, -0.186, 0.105], [0.06, -0.186, 0.105], [0.06, -0.148, 0.105]], 0.006, materials.metal);
  const mug = new THREE.Group(); groups.mug.add(mug);
  const cupProfile = [[0, -0.05], [0.032, -0.05], [0.037, -0.046], [0.04, 0.043], [0.038, 0.05], [0.033, 0.05], [0.032, 0.043], [0.029, -0.040], [0, -0.040]].map((p) => new THREE.Vector2(...p));
  const mugMat = mat('#e6b992', 0.27);
  const mugBody = mesh(new THREE.LatheGeometry(cupProfile, 48), mugMat, mug); mugBody.rotation.x = Math.PI / 2;
  const mugHandle = mesh(new THREE.TorusGeometry(0.029, 0.006, 12, 40, Math.PI * 1.7), mugMat, mug);
  mugHandle.rotation.x = Math.PI / 2; mugHandle.rotation.z = -Math.PI * 0.85; mugHandle.position.x = 0.042;

  const stand = new THREE.Group(); stand.position.set(0.45, 0.115, 0); groups.thread.add(stand);
  box(stand, [0.115, 0.095, 0.012], [0, 0, 0.055], materials.woodLight, 0.001);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    tube(stand, [[Math.cos(a) * 0.055, Math.sin(a) * 0.043, 0.008], [Math.cos(a) * 0.035, Math.sin(a) * 0.032, 0.05]], 0.007, materials.woodLight);
  }
  box(stand, [0.009, 0.011, 0.1], [0, 0, 0.111], materials.woodLight, 0.0008);
  const ring = new THREE.Group(); ring.position.z = 0.17; stand.add(ring);
  for (const s of [-1, 1]) { box(ring, [0.005, 0.010, 0.031], [s * 0.015, 0, 0], materials.crimson, 0.0003); box(ring, [0.025, 0.01, 0.005], [0, 0, s * 0.015], materials.crimson, 0.0003); }
  const needle = new THREE.Group(); groups.thread.add(needle);
  box(needle, [0.028, 0.033, 0.038], [0, 0, 0], materials.black, 0.002);
  box(needle, [0.007, 0.13, 0.007], [0, 0.079, 0], materials.metal, 0.0004);

  const suitcase = new THREE.Group(); suitcase.position.set(0.49, 0, 0); groups.ball.add(suitcase);
  box(suitcase, [0.40, 0.58, 0.020], [0, 0, 0.010], materials.black, 0.006);
  for (const sign of [-1, 1]) {
    box(suitcase, [0.016, 0.58, 0.044], [sign * 0.192, 0, 0.042], materials.dark, 0.006);
    box(suitcase, [0.40, 0.016, 0.044], [0, sign * 0.282, 0.042], materials.dark, 0.006);
  }
  box(suitcase, [0.4, 0.010, 0.066], [0, 0, 0.053], materials.black, 0.003);
  const ridge = cyl(suitcase, 0.018, 0.40, [0, 0, 0.086], materials.dark); ridge.rotation.set(0, 0, -Math.PI / 2);
  for (const y of [-0.11, -0.19]) { const rail = cyl(suitcase, 0.016, 0.30, [0, y, 0.018], materials.black); rail.rotation.set(0, 0, -Math.PI / 2); }
  tube(suitcase, [[-0.055, -0.299, 0.022], [-0.055, -0.326, 0.022], [0.055, -0.326, 0.022], [0.055, -0.299, 0.022]], 0.007, materials.black);
  for (const x of [-0.15, 0.15]) cyl(suitcase, 0.020, 0.025, [x, 0.295, 0.018], materials.black);
  const ball = new THREE.Group(); groups.ball.add(ball);
  const axes = [0.081, 0.047, 0.047];
  const footballPoint = (theta, phi, off = 0) => new THREE.Vector3(
    (axes[0] + off) * Math.cos(theta), (axes[1] + off) * Math.sin(theta) * Math.cos(phi), (axes[2] + off) * Math.sin(theta) * Math.sin(phi));
  const panelColors = ['#8735c1', '#de2738', '#f78d25', '#299b42'];
  for (let panel = 0; panel < 4; panel++) {
    const positions = [], normals = [], indices = [], rows = 32, cols = 16;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const p = footballPoint(Math.PI * i / rows, (panel + j / cols) * Math.PI / 2);
      positions.push(...p.toArray());
      const n = new THREE.Vector3(p.x / (0.081 * 0.081), p.y / (0.047 * 0.047), p.z / (0.047 * 0.047)).normalize(); normals.push(...n.toArray());
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setIndex(indices);
    mesh(g, new THREE.MeshPhysicalMaterial({ color: panelColors[panel], roughness: 0.47, clearcoat: 0.12, clearcoatRoughness: 0.5 }), ball);
    const seam = []; for (let i = 0; i <= 32; i++) seam.push(footballPoint(Math.PI * i / 32, panel * Math.PI / 2, 0.00025).toArray());
    tube(ball, seam, 0.00055, mat('#33323a', 0.65));
  }

  /* ── Motion ──────────────────────────────────────────────── */
  function sample(task, p) {
    const a = motion[task], n = a.n, f = clamp(p) * (n - 1), i = Math.floor(f), j = Math.min(n - 1, i + 1), u = f - i, o = {};
    for (const key of Object.keys(a)) {
      if (key === 'n') continue;
      const x = a[key][i], y = a[key][j];
      o[key] = Array.isArray(x) ? x.map((v, k) => mix(v, y[k], u)) : mix(x, y, u);
    }
    return o;
  }
  function applyPose(task, s) {
    for (const [k, g] of Object.entries(groups)) g.visible = k === task;
    joints.forEach((j, i) => { j.rotation.z = s.q[i]; });
    fingers.forEach((f, i) => { f.position.y = s.grip * (i ? -1 : 1); });
    if (task === 'stack') upper.position.set(...s.cube);
    if (task === 'mug') { drawer.position.y = s.drawer; mug.position.set(...s.mug); }
    if (task === 'thread') needle.position.set(...s.rod);
    if (task === 'ball') { ball.position.set(...s.ball); ball.rotation.x = s.roll; }
  }

  /* ── Camera ──────────────────────────────────────────────── */
  const CAM = {
    stack:  { eye: [1.42, -1.43, 1.10], target: [0.32, 0, 0.30], fov: 34 },
    mug:    { eye: [1.34, -1.40, 1.18], target: [0.33, 0, 0.27], fov: 35 },
    thread: { eye: [1.36, -1.40, 1.14], target: [0.33, 0, 0.28], fov: 34 },
    ball:   { eye: [1.35,  1.50, 1.10], target: [0.35, 0, 0.27], fov: 35 },
  };
  // The camera eases between per-task framings as an orbit around the look-at point
  // (radius / azimuth / elevation), so switching sides of the table swings around
  // the arm instead of dollying through it. Easing is time-based, so it behaves the
  // same at 20 fps and 120 fps.
  const orbit = (eye, target) => {
    const d = new THREE.Vector3(...eye).sub(new THREE.Vector3(...target));
    const r = d.length();
    return { r, az: Math.atan2(d.y, d.x), el: Math.asin(d.z / r) };
  };
  const camState = { ...orbit(CAM.stack.eye, CAM.stack.target), target: new THREE.Vector3(...CAM.stack.target), fov: 34 };
  const lerpAngle = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };
  function frame(task, p, time, dt, snap = false) {
    const c = CAM[task] || CAM.stack;
    const goal = orbit(c.eye, c.target);
    goal.az += (p - 0.5) * 0.09; // slow pan across each task
    // Narrow canvases: widen the lens a little, step back, and look a bit more
    // toward the base so the whole arm stays in frame.
    const k = Math.max(1, 1.55 / camera.aspect);
    const fov = Math.min(52, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * Math.pow(k, 0.42)) * 180 / Math.PI);
    goal.r *= Math.pow(k, 0.16);
    const target = new THREE.Vector3(c.target[0] - 0.09 * (k - 1), c.target[1], c.target[2] + 0.02 * (k - 1));
    const a = snap ? 1 : 1 - Math.exp(-dt / 0.32);
    camState.r = mix(camState.r, goal.r, a);
    camState.az = lerpAngle(camState.az, goal.az, a);
    camState.el = mix(camState.el, goal.el, a);
    camState.fov = mix(camState.fov, fov, a);
    camState.target.lerp(target, a);
    const eye = new THREE.Vector3(
      camState.target.x + camState.r * Math.cos(camState.el) * Math.cos(camState.az),
      camState.target.y + camState.r * Math.cos(camState.el) * Math.sin(camState.az),
      camState.target.z + camState.r * Math.sin(camState.el));
    if (!reduceMotion) { eye.x += Math.sin(time * 0.27) * 0.035; eye.y += Math.cos(time * 0.23) * 0.018; eye.z += Math.sin(time * 0.19) * 0.008; }
    camera.position.copy(eye); camera.lookAt(camState.target); camera.fov = camState.fov; camera.updateProjectionMatrix();
  }

  /* ── Scroll → timeline ───────────────────────────────────── */
  const segments = steps.map((el) => ({ el, task: el.dataset.task, title: el.dataset.title || el.dataset.task }));
  const narrow = () => window.innerWidth <= 900;
  const state = { task: 'stack', p: 0, qFrom: null, blend: 0, sectionProgress: 0, title: '' };

  function timeline() {
    const anchor = window.innerHeight * (narrow() ? 0.78 : 0.5);
    let idx = 0, u = 0;
    for (let i = 0; i < segments.length; i++) {
      const r = segments[i].el.getBoundingClientRect();
      if (anchor >= r.top) { idx = i; u = clamp((anchor - r.top) / r.height); }
    }
    const first = segments[0].el.getBoundingClientRect();
    if (anchor < first.top) { idx = 0; u = 0; }
    const seg = segments[idx];
    const motionP = smooth(at(u, 0.06, 0.86));
    const s = sample(seg.task, motionP);
    // Blend into the next task's start pose at the end of a step.
    const next = segments[idx + 1];
    if (next && next.task !== seg.task && u > 0.86) {
      const t = smooth(at(u, 0.86, 1));
      const s2 = sample(next.task, 0);
      const q = s.q.map((v, i) => mix(v, s2.q[i], t));
      const task = t < 0.5 ? seg.task : next.task;
      const base = t < 0.5 ? s : s2;
      applyPose(task, { ...base, q, grip: mix(s.grip, s2.grip, t) });
      state.task = task;
      state.title = t < 0.5 ? seg.title : next.title;
    } else {
      applyPose(seg.task, s);
      state.task = seg.task;
      state.title = seg.title;
    }
    state.p = motionP;
    const top = segments[0].el.getBoundingClientRect().top;
    const last = segments[segments.length - 1].el.getBoundingClientRect();
    state.sectionProgress = clamp((anchor - top) / (last.bottom - top));
  }

  /* ── Render loop: only while the section is on screen ────── */
  let visible = false, dirty = true, raf = 0, frames = 0;
  const clock = new THREE.Clock();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    dirty = true;
  }
  function render() {
    raf = 0;
    if (!visible) return;
    resize();
    timeline();
    const dt = Math.min(0.25, clock.getDelta());
    frame(state.task, state.p, clock.getElapsedTime(), dt);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera); frames++;
    if (hudTask && hudTask.textContent !== state.title) hudTask.textContent = state.title;
    if (hudBar) hudBar.style.width = (state.sectionProgress * 100).toFixed(1) + '%';
    dirty = false;
    // Keep a slow idle while visible (camera drift / camera easing); cheap at ~30 fps.
    if (!reduceMotion) schedule(33);
  }
  let timer = 0;
  function schedule(delay = 0) {
    if (raf) return;
    if (delay) { clearTimeout(timer); timer = setTimeout(() => { raf = requestAnimationFrame(render); }, delay); }
    else raf = requestAnimationFrame(render);
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) schedule();
  }, { rootMargin: '200px 0px' });
  io.observe(stage);

  window.addEventListener('scroll', () => { dirty = true; schedule(); }, { passive: true });
  window.addEventListener('resize', () => { resize(); schedule(); });

  window.__beaconStage = { camState, camera, state, get frames() { return frames; } };
  // First frame: snap the camera, then hand over to the loop.
  stage.classList.add('is-ready');
  resize(); timeline(); frame(state.task, state.p, 0, 0, true);
  visible = true; render();
}
