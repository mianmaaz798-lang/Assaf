/* ASSAF — ProductStage 3D (ES module, lazy-loaded by unbox.js).

   createProductStage(host, product, opts) -> Promise<stage>
     stage.setProduct(product, variantIndex)   swap bottle/label (reuses the WebGL context)
     stage.setVariant(variantIndex)            live size change (scale + label)
     stage.open()      lid lifts with overshoot, side flaps fold out, bottle rises and rotates
     stage.close()     bottle sinks back, flaps + lid close
     stage.pack()      close + gold seal sweeps across the lid, box settles
     stage.reset()     closed-box pose without animation
     stage.boxRect()   on-screen rect of the box (used for the fly-to-bag animation)
     stage.dispose()

   Real models: drop  assets/models/<product-id>.glb  (Y-up, metres, bottle standing on the origin).
   It is auto-detected, scaled to fit the box and replaces the placeholder bottle.
   Optional brand textures: assets/models/box-front.jpg and assets/models/box-lid.jpg (see README). */

import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const BOX = { w: 1.05, d: 1.05, h: 2.15, wall: 0.035 };
const BOTTLE_H = 1.95;
const GOLD = '#C2A36B';
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ easing + tween */
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inCubic: t => t * t * t,
  outBack: (t, s = 1.45) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};
function tween(ms, fn, e = ease.outCubic, delay = 0) {
  if (REDUCED()) { fn(1); return Promise.resolve(); }
  const k = window.ASSAF_TIMESCALE || 1; ms *= k; delay *= k;   // slow-motion hook for testing
  return new Promise(res => {
    const t0 = performance.now() + delay;
    const step = now => {
      const t = Math.min(1, Math.max(0, (now - t0) / ms));
      fn(e(t));
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ textures */
function loadImage(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
function goldify(img, w, h) { // tint the white logo gold
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in';
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#8A6D3B'); grd.addColorStop(.45, '#E9D3A3'); grd.addColorStop(1, '#A8864C');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  return c;
}
function boxFrontTexture(logo, name, renderer) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, '#1A1A1D'); bg.addColorStop(1, '#0C0C0E');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 1024);
  g.strokeStyle = 'rgba(194,163,107,.55)'; g.lineWidth = 3; g.strokeRect(28, 28, 456, 968);
  g.strokeStyle = 'rgba(194,163,107,.25)'; g.lineWidth = 1.5; g.strokeRect(40, 40, 432, 944);
  if (logo) { const L = goldify(logo, 220, 206); g.drawImage(L, 146, 300); }
  g.fillStyle = '#D9BF8C'; g.textAlign = 'center';
  g.font = '600 26px Inter, Arial, sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '10px';
  g.fillText((name || '').toUpperCase().slice(0, 22), 256, 640);
  g.font = '500 16px Inter, Arial, sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '6px';
  g.fillStyle = 'rgba(217,191,140,.7)';
  g.fillText('EAU DE PARFUM', 256, 680);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function lidTexture(logo, renderer) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#141416'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(194,163,107,.45)'; g.lineWidth = 3; g.strokeRect(24, 24, 464, 464);
  if (logo) g.drawImage(goldify(logo, 200, 188), 156, 162);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function labelTexture(product, variant, renderer) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.font = '600 58px Inter, Arial, sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '6px';
  const name = (product.name || '').toUpperCase();
  const words = name.split(' ');
  const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' '), l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
  g.fillText(l1, 512, l2 ? 190 : 230);
  if (l2) g.fillText(l2, 512, 260);
  g.font = '500 30px Inter, Arial, sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '14px';
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.fillText('ASSAF', 512, 380);
  g.font = '400 24px Inter, Arial, sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '4px';
  g.fillText((variant && variant.label || '').toUpperCase(), 512, 430);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function radialShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(.45, 'rgba(0,0,0,.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ geometry */
function makeBox(frontTex, lidTex) {
  const { w, d, h, wall } = BOX;
  const outer = new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: .62, metalness: 0, clearcoat: .25, clearcoatRoughness: .5, sheen: .4, sheenColor: new THREE.Color('#2a2a2e') });
  const front = new THREE.MeshPhysicalMaterial({ map: frontTex, roughness: .55, clearcoat: .3, clearcoatRoughness: .45 });
  const liner = new THREE.MeshStandardMaterial({ color: '#CDB68A', roughness: .85, metalness: 0, side: THREE.BackSide });
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: .32 });

  const box = new THREE.Group();
  const body = new THREE.Group(); box.add(body);
  const wallGeo = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; body.add(m); return m; };
  // front wall gets the branded face on +z
  add(wallGeo(w, h, wall), [outer, outer, outer, outer, front, outer], 0, h / 2, d / 2 - wall / 2);
  add(wallGeo(w, h, wall), outer, 0, h / 2, -d / 2 + wall / 2);
  add(wallGeo(wall, h, d), outer, -w / 2 + wall / 2, h / 2, 0);
  add(wallGeo(wall, h, d), outer, w / 2 - wall / 2, h / 2, 0);
  add(wallGeo(w, wall, d), outer, 0, wall / 2, 0);
  // champagne liner inside
  const linerMesh = new THREE.Mesh(new THREE.BoxGeometry(w - wall * 2.2, h - wall, d - wall * 2.2), liner);
  linerMesh.position.y = h / 2 + wall / 2; body.add(linerMesh);
  // a thin gold foil band near the base
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + .004, .03, d + .004), goldMat);
  band.position.y = .16; body.add(band);

  // hinged lid (pivot at the back top edge)
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, h, -d / 2);
  const lidMat = new THREE.MeshPhysicalMaterial({ map: lidTex, roughness: .55, clearcoat: .3, clearcoatRoughness: .45 });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w + .03, .06, d + .03), [outer, outer, lidMat, outer, outer, outer]);
  lid.position.set(0, .03, d / 2 + .0); lid.castShadow = true; lidPivot.add(lid);
  // tuck flap hanging from the lid front
  const tuck = new THREE.Mesh(new THREE.BoxGeometry(w - .02, .02, .22), outer);
  tuck.position.set(0, .0, d + .1); tuck.rotation.x = Math.PI / 2; tuck.castShadow = true;
  lidPivot.add(tuck);
  // brand seal tape (hidden until packing)
  const tape = new THREE.Mesh(new THREE.BoxGeometry(.18, .012, d + .26), goldMat);
  tape.position.set(0, .066, d / 2 + .1); tape.scale.z = .001; tape.visible = false; lidPivot.add(tape);
  box.add(lidPivot);

  // inner dust flaps hinged on the left/right top edges
  const flapMat = new THREE.MeshStandardMaterial({ color: '#CDB68A', roughness: .85 });
  const mkFlap = side => {
    const pivot = new THREE.Group(); pivot.position.set(side * (w / 2 - wall), h - .002, 0);
    const f = new THREE.Mesh(new THREE.BoxGeometry(w * .42, .012, d - .08), flapMat);
    f.position.x = -side * (w * .21); f.castShadow = true; pivot.add(f); box.add(pivot); return pivot;
  };
  const flaps = [mkFlap(-1), mkFlap(1)];
  return { group: box, lidPivot, tape, flaps };
}

function placeholderBottle(product, renderer) {
  const tint = new THREE.Color(product.liquid ? product.liquid[0] : '#d7c3a8');
  const deep = new THREE.Color(product.liquid ? product.liquid[1] : '#6b5233');
  const g = new THREE.Group();
  const bodyH = 1.32, r = .36, capH = .52;
  // glass body: lathe profile with softly rounded base + shoulder
  const pts = [];
  pts.push(new THREE.Vector2(0, 0));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(r - .05 + Math.cos(a) * .05, .05 + Math.sin(a) * .05)); }
  pts.push(new THREE.Vector2(r, bodyH - .07));
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(r - .07 + Math.cos(a) * .07, bodyH - .07 + Math.sin(a) * .07)); }
  pts.push(new THREE.Vector2(.12, bodyH)); pts.push(new THREE.Vector2(.12, bodyH + .07)); pts.push(new THREE.Vector2(0, bodyH + .07));
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: .02, transmission: 1, thickness: .35, ior: 1.5,
    attenuationColor: tint, attenuationDistance: 1.4, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.8,
    specularIntensity: 1, transparent: true,
  });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), glass);
  body.castShadow = true; g.add(body);
  // liquid (slightly inset)
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r - .045, r - .045, bodyH - .2, 64),
    new THREE.MeshPhysicalMaterial({ color: tint.clone().lerp(deep, .45), roughness: .1, metalness: 0, clearcoat: .6, transparent: true, opacity: .88, envMapIntensity: 1.1 }));
  liquid.renderOrder = -1;
  liquid.position.y = (bodyH - .2) / 2 + .08; g.add(liquid);
  // thick glass base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r - .01, r - .01, .1, 64), glass);
  base.position.y = .05; g.add(base);
  // brushed metal collar + cap
  const metal = new THREE.MeshPhysicalMaterial({ color: product.family === 'Niche' ? '#C9A96E' : '#D7D7DA', metalness: 1, roughness: .26, clearcoat: .6, clearcoatRoughness: .2 });
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .1, 48), metal);
  collar.position.y = bodyH + .1; g.add(collar);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * .92, r * .92, capH, 96), metal);
  cap.position.y = bodyH + .12 + capH / 2; cap.castShadow = true; g.add(cap);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(r * .9, r * .92, .015, 96), new THREE.MeshPhysicalMaterial({ color: '#BEBEC2', metalness: 1, roughness: .12 }));
  capTop.position.y = bodyH + .12 + capH + .007; g.add(capTop);
  // printed label: wraps the front of the glass
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTexture(product, product.variants && product.variants[0], renderer), transparent: true, roughness: .4, metalness: .1, depthWrite: false });
  const label = new THREE.Mesh(new THREE.CylinderGeometry(r + .003, r + .003, .7, 96, 1, true, -0.9, 1.8), labelMat);
  label.position.y = bodyH * .52; g.add(label); // arc is centred on +z (facing the camera)
  const s = BOTTLE_H / (bodyH + .12 + capH + .02);
  g.scale.setScalar(s);
  g.userData = { label, labelMat, placeholder: true };
  return g;
}

let manifestP = null;
function manifest() {
  // assets/models/manifest.json lists which optional assets exist, so nothing 404s:
  // { "models": ["arrogate-pink-200ml"], "boxFront": "box-front.jpg", "boxLid": "box-lid.jpg" }
  if (!manifestP) manifestP = fetch(new URL('../models/manifest.json', import.meta.url).href)
    .then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifestP;
}
async function tryLoadGLB(product) {
  const m = await manifest();
  const ids = [product.id].concat((product.variants || []).map(v => v.id));
  const hit = (m.models || []).find(id => ids.indexOf(id) > -1);
  if (!hit) return null;
  const url = new URL(`../models/${hit}.glb`, import.meta.url).href;
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3());
    const s = BOTTLE_H / Math.max(size.y, 1e-3);
    root.scale.setScalar(s);
    const bb2 = new THREE.Box3().setFromObject(root), c = bb2.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -bb2.min.y, -c.z);
    const g = new THREE.Group(); g.add(root); g.userData = { placeholder: false };
    return g;
  } catch (e) { return null; }
}

function sizeScale(variant) {
  const m = /(\d+)\s*ml/i.exec(variant && variant.label || '');
  if (!m) return 1;
  const ml = +m[1];
  return Math.min(1.05, Math.max(.62, .55 + .45 * Math.cbrt(ml / 200)));
}


/* ------------------------------------------------------------------ real product photo -> 3D cut-out
   Without a .glb, each product is shown with its own studio photo: the white
   backdrop and the soft baked-in shadow are flood-filled away from the image
   border (stopping at the bottle's edges), so the actual bottle stands in the scene. */
export function cutoutCanvas(img, keepAll) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const full = document.createElement('canvas'); full.width = W; full.height = H;
  const fg = full.getContext('2d'); fg.drawImage(img, 0, 0);
  if (keepAll) return { canvas: full, box: { x: 0, y: 0, w: W, h: H } };
  const N = 256, sm = document.createElement('canvas'); sm.width = sm.height = N;
  const sg = sm.getContext('2d', { willReadFrequently: true }); sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high'; sg.drawImage(img, 0, 0, N, N);
  const d = sg.getImageData(0, 0, N, N).data;
  const L = new Float32Array(N * N), S = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L[i] = .299 * r + .587 * g + .114 * b; S[i] = (mx - mn) / (mx + 1e-6);
  }
  const seen = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0;
  const TOL = .05, FLOOR = .12, SAT = .15;
  for (let i = 0; i < N; i++) for (const k of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!seen[k] && S[k] < SAT) { seen[k] = 1; q[qt++] = k; }
  while (qh < qt) {
    const k = q[qh++], x = k % N, y = (k / N) | 0;
    const nb = [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, y > 0 ? k - N : -1, y < N - 1 ? k + N : -1];
    for (const n of nb) if (n >= 0 && !seen[n] && S[n] < SAT && L[n] > FLOOR && Math.abs(L[n] - L[k]) < TOL) { seen[n] = 1; q[qt++] = n; }
  }
  // mask canvas (white = product), slightly eroded + feathered
  const mc = document.createElement('canvas'); mc.width = mc.height = N;
  const mg = mc.getContext('2d'), md = mg.createImageData(N, N);
  let minX = N, minY = N, maxX = 0, maxY = 0, kept = 0;
  for (let i = 0; i < N * N; i++) {
    const v = seen[i] ? 0 : 255; md.data[i * 4 + 3] = v; md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255;
    if (v) { kept++; const x = i % N, y = (i / N) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  // a bad mask (nearly everything or nothing kept) falls back to the full photo
  if (kept < N * N * .03 || kept > N * N * .85) return { canvas: full, box: { x: 0, y: 0, w: W, h: H }, failed: true };
  mg.putImageData(md, 0, 0);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d');
  og.filter = 'blur(' + Math.max(1, W / 400) + 'px)';
  og.drawImage(mc, 0, 0, W, H);
  og.filter = 'none';
  og.globalCompositeOperation = 'source-in';
  og.drawImage(img, 0, 0);
  const sx = W / N, sy = H / N, pad = 2;
  return { canvas: out, box: { x: Math.max(0, (minX - pad) * sx), y: Math.max(0, (minY - pad) * sy), w: Math.min(W, (maxX - minX + 1 + pad * 2) * sx), h: Math.min(H, (maxY - minY + 1 + pad * 2) * sy) } };
}

function findCapSplit(canvas) {
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0, r = 0, g = 0, b = 0, minX = W, maxX = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] > 160) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    rows.push(n ? { r: r / n, g: g / n, b: b / n, w: maxX - minX } : { r: 0, g: 0, b: 0, w: 0 });
  }
  const top = rows.findIndex(q => q.w > W * .08); if (top < 0) return null;
  const k = Math.max(2, Math.round(H * .012)), avg = (a, z) => {
    const o = { r: 0, g: 0, b: 0, w: 0 }; let n = 0;
    for (let y = Math.max(0, a); y < Math.min(H, z); y++) { o.r += rows[y].r; o.g += rows[y].g; o.b += rows[y].b; o.w += rows[y].w; n++; }
    if (n) { o.r /= n; o.g /= n; o.b /= n; o.w /= n; } return o;
  };
  let best = -1, at = -1;
  const from = top + Math.round(H * .06), to = top + Math.round((H - top) * .45);
  for (let y = from; y < to; y++) {
    const a = avg(y - k, y), b = avg(y, y + k);
    const score = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) + Math.abs(a.w - b.w) / W * 140;
    if (score > best) { best = score; at = y; }
  }
  return best > 18 ? at : Math.round(top + (H - top) * .24);
}

/* The photos only show bottles with the cap on, so the pump under the cap is modelled:
   crimped metal collar on the neck, stem, and an actuator button with a nozzle hole. */
function makeSprayer(neckW, metalColor) {
  const g = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: metalColor, metalness: 1, roughness: .22, clearcoat: .7, clearcoatRoughness: .15 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141416', roughness: .5 });
  const R = Math.max(.07, neckW * .5);                  // collar radius follows the bottle neck
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * .92, R, .1, 48), metal);
  collar.position.y = .05; g.add(collar);
  const crimp = new THREE.Mesh(new THREE.TorusGeometry(R * .9, .012, 10, 48), metal);
  crimp.rotation.x = Math.PI / 2; crimp.position.y = .1; g.add(crimp);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(R * .22, R * .22, .07, 24), metal);
  stem.position.y = .135; g.add(stem);
  const act = new THREE.Group(); act.position.y = .17; g.add(act);  // actuator (moves when pressed)
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(R * .62, R * .66, .13, 48), metal);
  btn.position.y = .065; act.add(btn);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R * .6, R * .62, .012, 48), new THREE.MeshPhysicalMaterial({ color: metalColor, metalness: 1, roughness: .1 }));
  top.position.y = .136; act.add(top);
  // nozzle orifice on the side of the button, aimed to the right/front (towards the viewer)
  const dir = new THREE.Vector3(.85, 0, .53).normalize();
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(R * .11, R * .11, .02, 16), dark);
  hole.position.copy(dir).multiplyScalar(R * .64); hole.position.y = .075;
  hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); act.add(hole);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { actuator: act, nozzleLocal: hole.position.clone().add(dir.clone().multiplyScalar(.02)), dir, height: .3 };
  return g;
}

async function photoProduct(product, variant, renderer) {
  const src = (variant && variant.image) || product.image;
  if (!src) return null;
  const img = await loadImage(new URL('../../' + src, import.meta.url).href);
  if (!img) return null;
  const isSet = product.family === 'Gift Sets';
  const cut = cutoutCanvas(img, isSet);
  const { box } = cut;
  // colour: the original photo (backdrop pushed to pure white so it vanishes under multiply blending)
  const crop = document.createElement('canvas'); crop.width = Math.round(box.w); crop.height = Math.round(box.h);
  const cg = crop.getContext('2d', { willReadFrequently: true });
  cg.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, crop.width, crop.height);
  const id = cg.getImageData(0, 0, crop.width, crop.height), dd = id.data;
  for (let i = 0; i < dd.length; i += 4) for (let c = 0; c < 3; c++) dd[i + c] = Math.min(255, dd[i + c] * 1.02 + (dd[i + c] > 238 ? (dd[i + c] - 238) * 1.2 : 0));
  cg.putImageData(id, 0, 0);
  // silhouette: the cut-out, used only so the cast shadow follows the bottle's outline
  const maskC = document.createElement('canvas'); maskC.width = crop.width; maskC.height = crop.height;
  maskC.getContext('2d').drawImage(cut.canvas, box.x, box.y, box.w, box.h, 0, 0, crop.width, crop.height);
  const tex = { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()), dispose() {} };
  const aspect = crop.width / crop.height;
  let h = BOTTLE_H, w = h * aspect;
  if (isSet || cut.failed) { w = 1.7; h = w / aspect; }  // gift sets: a framed product card
  const g = new THREE.Group();
  const slice = (src, y0, y1) => {
    const c = document.createElement('canvas'); c.width = crop.width; c.height = Math.max(1, y1 - y0);
    c.getContext('2d').drawImage(src, 0, y0, crop.width, c.height, 0, 0, crop.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = tex.anisotropy; return t;
  };
  const piece = (y0, y1) => { // a slice of the photo (rows y0..y1 of the crop) as its own plane
    const t = slice(crop, y0, y1), mk = slice(maskC, y0, y1);
    const ph = h * Math.max(1, y1 - y0) / crop.height;
    // multiply blending: white disappears into the studio backdrop and the photo's own soft shadow
    // reads as a natural shadow, exactly like the product cards on the site
    const mat = (isSet || cut.failed)
      ? new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false })
      : new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ph), mat);
    m.castShadow = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mk, alphaTest: .5 }); // shadow follows the silhouette
    m.userData.maskTex = mk;
    return { mesh: m, h: ph };
  };
  let cap = null, split = null;
  if (!(isSet || cut.failed)) split = findCapSplit(crop);
  if (split) {
    const body = piece(split, crop.height), capP = piece(0, split);
    body.mesh.position.y = body.h / 2; g.add(body.mesh);
    cap = new THREE.Group(); cap.position.y = body.h;           // pivot at the bottom of the cap
    capP.mesh.position.y = capP.h / 2; cap.add(capP.mesh); g.add(cap);
    tex.dispose();
    g.userData.capRest = cap.position.clone();
    // neck width + centre from the silhouette just below the cap line
    const md = maskC.getContext('2d', { willReadFrequently: true }).getImageData(0, Math.min(crop.height - 1, split + Math.round(crop.height * .03)), crop.width, 1).data;
    let x0 = -1, x1 = -1;
    for (let x = 0; x < crop.width; x++) if (md[x * 4 + 3] > 128) { if (x0 < 0) x0 = x; x1 = x; }
    const bodyW = x0 < 0 ? w * .5 : w * (x1 - x0) / crop.width;
    const cx = x0 < 0 ? 0 : w * ((x0 + x1) / 2 / crop.width - .5);
    // metal finish sampled from the cap (silver / gold / black caps get a matching pump)
    const cd = crop.getContext('2d').getImageData(Math.round(crop.width * .5), Math.round(split * .5), 1, 1).data;
    const lum = (cd[0] + cd[1] + cd[2]) / 3;
    const metalColor = lum < 70 ? '#2a2a2e' : (cd[0] - cd[2] > 25 ? '#C9A96E' : '#D4D4D8');
    const sprayer = makeSprayer(Math.min(bodyW * .38, .34), metalColor);
    sprayer.position.set(cx, body.h - .01, .0);
    sprayer.visible = false;
    g.add(sprayer);
    g.userData.sprayer = sprayer;
  } else {
    const all = piece(0, crop.height); all.mesh.position.y = h / 2; g.add(all.mesh); tex.dispose();
  }
  if (isSet || cut.failed) {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + .08, h + .08), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6 }));
    frame.position.set(0, h / 2, -.01); frame.castShadow = true; g.add(frame);
  }
  const bodyTop = split ? h * (crop.height - split) / crop.height : h * .97;
  const sp = g.userData.sprayer;
  const nozzle = sp ? sp.position.clone().add(sp.userData.actuator.position).add(sp.userData.nozzleLocal) : new THREE.Vector3(0, bodyTop + .02, .02);
  Object.assign(g.userData, { placeholder: false, photo: true, height: h, width: w, cap, sprayable: !(isSet || cut.failed), nozzle, nozzleDir: sp ? sp.userData.dir : null });
  return g;
}

/* ------------------------------------------------------------------ perfume mist */
function sprayPuffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeMist(count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: sprayPuffTexture() }, uTint: { value: new THREE.Color('#dfe5ec') }, uScale: { value: 300 } },
    vertexShader: 'attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;' +
      'void main(){ vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D uMap; uniform vec3 uTint; varying float vA;' +
      'void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(uTint, t.a*vA); if(gl_FragColor.a<.01) discard; }',
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const P = Array.from({ length: count }, () => ({ life: 0, max: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0 }));
  return { points: pts, particles: P, active: 0 };
}

/* ------------------------------------------------------------------ stage */
export async function createProductStage(host, product, opts = {}) {
  const mobile = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius for a soft penumbra
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // studio backdrop drawn inside the scene (not CSS) so the glass has something to refract
  function backdrop() {
    const cs = getComputedStyle(host);
    const v = (k, d) => (cs.getPropertyValue(k).trim() || d);
    const c = document.createElement('canvas'); c.width = 16; c.height = 512;
    const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, v('--stage-top', '#ffffff')); grd.addColorStop(.62, v('--stage-mid', '#f1eee8')); grd.addColorStop(1, v('--stage-floor', '#e4dfd5'));
    g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = t;
  }
  backdrop();
  const themeObs = new MutationObserver(backdrop);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);

  // key light with soft shadows + gentle fill
  const key = new THREE.DirectionalLight('#fff7ec', 2.2);
  key.position.set(3.2, 7, 4.2); key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 4; key.shadow.camera.bottom = -2;
  key.shadow.radius = 10; key.shadow.blurSamples = 16; key.shadow.bias = -.0004; key.shadow.normalBias = .02;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffe9c7', .9); rim.position.set(-4, 4, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9bfae', .35));

  // ground: shadow catcher + soft contact shadows (box + product)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .16 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const shadowTex = radialShadowTexture();
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = .002; scene.add(contact);
  const contactP = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
  contactP.rotation.x = -Math.PI / 2; contactP.position.y = .003; scene.add(contactP);

  const logo = await loadImage(new URL('../img/logo.png', import.meta.url).href);
  const mf = await manifest();
  const customFront = mf.boxFront ? await loadImage(new URL('../models/' + mf.boxFront, import.meta.url).href) : null;
  const customLid = mf.boxLid ? await loadImage(new URL('../models/' + mf.boxLid, import.meta.url).href) : null;
  const texFrom = img => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };

  let frontTex = customFront ? texFrom(customFront) : boxFrontTexture(logo, product.name, renderer);
  const box = makeBox(frontTex, customLid ? texFrom(customLid) : lidTexture(logo, renderer));
  const BOX_X = -.78, LAND = new THREE.Vector3(.86, 0, .3), TOP_Y = BOX.h + .1;
  box.group.position.x = BOX_X; contact.position.x = BOX_X;
  scene.add(box.group);

  // product rig: lift (path in/out of the box) > spin (user rotation) > model
  const lift = new THREE.Group(), spin = new THREE.Group();
  lift.add(spin); scene.add(lift);
  let model = null, current = product, variantIdx = opts.variant || 0, sizeS = 1;

  const mist = makeMist(mobile ? 120 : 220);
  scene.add(mist.points);

  const state = { zoom: 0, lid: 0, flaps: 0, rise: 0, out: 0, squash: 0, pop: 0, tape: 0, rotY: 0, rotX: 0, vel: 0, auto: true, lastUser: 0, t: 0 };
  host._assafStage = state; // handy for debugging / tests
  const isPhoto = () => !!(model && model.userData.photo);
  const look = new THREE.Vector3(.05, 1.75, 0), lookAt = new THREE.Vector3(), tmpV = new THREE.Vector3(), wide = new THREE.Vector3(0, 2.5, 10);

  function applyPose() {
    box.lidPivot.rotation.x = -state.lid * 3.3;             // ~190°: the lid folds right back behind the box
    box.flaps[0].rotation.z = -state.flaps * 1.75;
    box.flaps[1].rotation.z = state.flaps * 1.75;
    box.tape.visible = state.tape > 0;
    box.tape.scale.z = Math.max(.001, state.tape);
    box.tape.position.z = BOX.d / 2 + .1 - (1 - state.tape) * (BOX.d / 2 + .13);
    // the box "pops" (hops + stretches) when it calls the product back
    const pop = Math.sin(state.pop * Math.PI);
    box.group.position.y = pop * .28;
    box.group.scale.set(1 - pop * .04, 1 + pop * .07, 1 - pop * .04);

    // path: rise straight up out of the box, then arc over and land beside it
    const o = state.out, rise = state.rise;
    let x = BOX_X, y = lerp(.04, TOP_Y, rise), z = 0;
    if (o > 0) {
      x = lerp(BOX_X, LAND.x, o);
      y = lerp(TOP_Y, 0, o) + Math.sin(o * Math.PI) * .55;
      z = lerp(0, LAND.z, o);
    }
    lift.position.set(x, y, z);
    // grows from "inside-box" size to full size as it comes out (lets wide gift sets fit the box)
    const inside = model ? Math.min(1, (BOX.w - .12) / Math.max(.01, model.userData.width || .8)) : 1;
    const grow = lerp(inside, 1, Math.min(1, o * 1.4));
    const sq = state.squash;
    spin.scale.set(sizeS * grow * (1 + sq * .06), sizeS * grow * (1 - sq * .08), sizeS * grow);
    spin.rotation.y = state.rotY;
    spin.rotation.x = state.rotX;
    contactP.position.set(x, .003, z);
    contactP.material.opacity = o * Math.max(0, 1 - y / 1.2) * .9;
    contactP.scale.setScalar(.6 + (model && model.userData.width || .7) * .55);
    // close-up: move in on the bottle's neck/nozzle
    const zk = state.zoom;
    const nozY = (model && model.userData.nozzle ? model.userData.nozzle.y : BOTTLE_H * .8) * sizeS;
    const focus = tmpV.set(LAND.x + .35, nozY * .92, LAND.z);
    camera.position.set(lerp(wide.x, LAND.x + .5, zk), lerp(wide.y, nozY * 1.02, zk), lerp(wide.z, LAND.z + wide.z * .5, zk));
    lookAt.copy(look).lerp(focus, zk);
    camera.lookAt(lookAt);
  }

  async function buildModel(p, vIdx) {
    const v = p.variants && p.variants[vIdx];
    return (await tryLoadGLB(p)) || (await photoProduct(p, v, renderer)) || placeholderBottle(p, renderer);
  }
  function disposeModel(m) {
    if (!m) return;
    spin.remove(m);
    m.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); }); if (o.customDepthMaterial) o.customDepthMaterial.dispose(); if (o.userData.maskTex) o.userData.maskTex.dispose(); } });
  }
  async function setProduct(p, vIdx = 0) {
    current = p; variantIdx = vIdx;
    const next = await buildModel(p, vIdx);
    disposeModel(model); model = next; spin.add(model);
    if (!customFront) {
      const old = frontTex; frontTex = boxFrontTexture(logo, p.name, renderer);
      box.group.traverse(o => { if (o.isMesh && Array.isArray(o.material) && o.material[4] && o.material[4].map === old) o.material[4].map = frontTex; });
      old.dispose();
    }
    sizeS = sizeScale(p.variants && p.variants[vIdx]);
  }
  async function setVariant(i) {
    variantIdx = i;
    const v = current.variants && current.variants[i];
    const target = sizeScale(v), from = sizeS;
    if (model && model.userData.placeholder) {
      const lm = model.userData.labelMat; if (lm.map) lm.map.dispose();
      lm.map = labelTexture(current, v, renderer); lm.needsUpdate = true;
    } else if (model && model.userData.photo && v && v.image && current.variants.some((x, k) => k !== i && x.image !== v.image)) {
      const next = await buildModel(current, i);   // a size with its own photo swaps the product image
      disposeModel(model); model = next; spin.add(model);
    }
    await tween(520, t => { sizeS = lerp(from, target, t); }, ease.outBack);
  }

  // drag to rotate (pointer + inertia), arrow keys for keyboard users.
  // Photo products swivel (±35°) and spring back so the real product always faces you;
  // full 360° turns once a .glb model is supplied.
  let dragging = false, lastX = 0, lastY = 0;
  const clampY = () => { if (isPhoto()) state.rotY = Math.max(-.62, Math.min(.62, state.rotY)); };
  const onDown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; state.vel = 0; host.classList.add('dragging', 'interacted'); host.setPointerCapture && host.setPointerCapture(e.pointerId); };
  const onMove = e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    state.rotY += dx * .011; state.vel = dx * .011; clampY();
    state.rotX = Math.max(-.3, Math.min(.3, state.rotX + dy * .004));
    state.lastUser = performance.now();
  };
  const onUp = () => { dragging = false; host.classList.remove('dragging'); state.lastUser = performance.now(); };
  const onKey = e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); state.rotY += (k === 'ArrowLeft' ? -1 : 1) * Math.PI / 12; clampY(); state.lastUser = performance.now(); host.classList.add('interacted'); }
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); state.rotX = Math.max(-.3, Math.min(.3, state.rotX + (k === 'ArrowUp' ? -.08 : .08))); state.lastUser = performance.now(); }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); spray(); }
  };
  host.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  host.addEventListener('keydown', onKey);

  /* ---------------- mist simulation */
  const tmp = new THREE.Vector3();
  function nozzleWorld() {
    const n = model && model.userData.nozzle ? model.userData.nozzle.clone() : new THREE.Vector3(0, BOTTLE_H * .97, .1);
    spin.updateMatrixWorld(true);
    return spin.localToWorld(n);
  }
  function emit(n) {
    const origin = nozzleWorld();
    const dir = model && model.userData.nozzleDir ? model.userData.nozzleDir.clone().setY(.12).normalize().transformDirection(spin.matrixWorld) : new THREE.Vector3(.8, .28, .55).normalize();
    for (let i = 0; i < n; i++) {
      const p = mist.particles.find(q => q.life <= 0); if (!p) return;
      p.p.copy(origin).add(tmp.set((Math.random() - .5) * .01, (Math.random() - .5) * .01, 0));
      const spread = .22;
      p.v.copy(dir).add(tmp.set((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread)).normalize().multiplyScalar(1.6 + Math.random() * 1.8);
      p.max = p.life = 1 + Math.random() * .9;
      p.s = .06 + Math.random() * .08;
    }
  }
  let sprayT = 0;
  function stepMist(dt) {
    if (sprayT > 0) { sprayT -= dt; emit(Math.ceil((mobile ? 110 : 190) * dt)); }
    const pos = mist.points.geometry.attributes.position, al = mist.points.geometry.attributes.aAlpha, sz = mist.points.geometry.attributes.aSize;
    let any = false;
    mist.particles.forEach((p, i) => {
      if (p.life > 0) {
        any = true;
        p.life -= dt;
        p.v.multiplyScalar(Math.pow(.18, dt));           // air drag
        p.v.y += .25 * dt;                               // fine mist drifts up a little
        p.p.addScaledVector(p.v, dt);
        const k = Math.max(0, p.life / p.max);
        pos.setXYZ(i, p.p.x, p.p.y, p.p.z);
        al.setX(i, Math.min(1, (1 - k) * 6) * k * .6);
        sz.setX(i, p.s + (1 - k) * .5);
      } else { al.setX(i, 0); }
    });
    if (any || sprayT > 0) { pos.needsUpdate = al.needsUpdate = sz.needsUpdate = true; }
  }
  let spraying = false;
  function capPose(t) { // 0 = on the bottle, 1 = lifted off and set down beside it
    const cap = model && model.userData.cap; if (!cap) return;
    if (model.userData.sprayer) model.userData.sprayer.visible = t > .02;
    const rest = model.userData.capRest, w = model.userData.width || .6;
    const lift = Math.sin(Math.min(1, t * 1.6) * Math.PI / 2);   // goes up first…
    const side = Math.max(0, (t - .35) / .65);                     // …then moves aside and down
    cap.position.set(rest.x + side * (w * .5 + .22), rest.y + lift * .55 - side * .3, rest.z + side * .12);
    cap.rotation.z = -side * .35;
  }
  async function spray() {
    if (REDUCED() || state.out < .99 || spraying || !model || model.userData.sprayable === false) return;
    spraying = true;
    const hasCap = !!model.userData.cap;
    if (hasCap) await tween(620, capPose, ease.outBack);                  // 1. cap comes off
    await tween(760, t => { state.zoom = t; }, ease.inOutCubic);          // 2. close-up on the bottle
    sprayT = .5;                                                            // 3. psst
    host.dispatchEvent(new CustomEvent('assaf:spray'));
    const act = model.userData.sprayer && model.userData.sprayer.userData.actuator, a0 = act ? act.position.y : 0;
    await tween(420, t => { const k = Math.sin(t * Math.PI); state.squash = k * .25; if (act) act.position.y = a0 - k * .045; }, ease.outCubic);
    if (act) act.position.y = a0;
    await new Promise(res => setTimeout(res, 900));                        // let the mist hang in the air
    await Promise.all([
      hasCap ? tween(560, t => capPose(1 - t), ease.inOutCubic, 150) : null, // 4. cap back on
      tween(800, t => { state.zoom = 1 - t; }, ease.inOutCubic),             //    and pull back out
    ]);
    spraying = false;
  }

  // render loop (paused when the tab is hidden)
  let last = performance.now(), running = true;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; state.t += dt;
    if (!dragging) {
      state.rotY += state.vel; state.vel *= .9; clampY();
      const idle = now - state.lastUser > 2200;
      if (state.out > .99 && !REDUCED() && state.auto && idle) {
        if (isPhoto()) state.rotY += (Math.sin(state.t * .9) * .22 - state.rotY) * Math.min(1, dt * 2.2); // gentle sway + spring back
        else state.rotY += dt * .45;
      }
      if (idle) state.rotX *= .95;
    }
    stepMist(dt);
    applyPose();
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  const onVis = () => { if (document.hidden) { renderer.setAnimationLoop(null); running = false; } else if (!running) { last = performance.now(); renderer.setAnimationLoop(frame); running = true; } };
  document.addEventListener('visibilitychange', onVis);

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = 30;
    // frame the box and the landed product side by side, and the product at the top of its rise
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needH = 4.5, needW = 3.9;
    const dist = Math.max(needH / (2 * tan), needW / (2 * tan * camera.aspect));
    wide.set(0, 2.5, dist); camera.position.copy(wide);
    mist.points.material.uniforms.uScale.value = h * renderer.getPixelRatio() * .9;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  await setProduct(product, variantIdx);
  applyPose(); renderer.render(scene, camera);

  /* ---------------- choreography */
  async function open() {
    state.auto = true; state.rotY = 0; state.rotX = 0;
    await Promise.all([
      tween(760, t => { state.lid = t; }, ease.outBack),
      tween(560, t => { state.flaps = t; }, ease.outBack, 240),
      tween(820, t => { state.rise = t; }, ease.outCubic, 380),     // comes all the way out of the box
    ]);
    await tween(780, t => { state.out = t; }, ease.inOutCubic);       // arcs over and lands beside it
    await tween(300, t => { state.squash = Math.sin(t * Math.PI) * .9; }, ease.outCubic); // landing bounce
    state.squash = 0;
    await new Promise(r => setTimeout(r, REDUCED() ? 0 : 250));
    await spray();
  }
  async function settleRotation() {
    const from = state.rotY, to = isPhoto() ? 0 : Math.round(from / (Math.PI * 2)) * Math.PI * 2, fx = state.rotX;
    state.vel = 0;
    await tween(360, t => { state.rotY = lerp(from, to, t); state.rotX = lerp(fx, 0, t); }, ease.inOutCubic);
  }
  async function goBack() {
    state.auto = false;
    sprayT = 0;
    while (spraying) await new Promise(res => setTimeout(res, 60));
    await settleRotation();
    // the box pops up to call the product back, which jumps in and sinks down
    const popP = tween(520, t => { state.pop = t; }, ease.outCubic);
    await tween(700, t => { state.out = 1 - t; }, ease.inOutCubic, 120);
    await popP;
    await tween(520, t => { state.rise = 1 - t; }, ease.inCubic);
    await Promise.all([
      tween(300, t => { state.flaps = 1 - t; }, ease.inOutCubic),
      tween(480, t => { state.lid = 1 - t; }, ease.inOutCubic, 100),
    ]);
  }
  async function close() { await goBack(); }
  async function pack() {
    await goBack();
    await tween(420, t => { state.tape = t; }, ease.outCubic);
    // small settle: the box squashes as the seal presses down
    await tween(260, t => { const k = Math.sin(t * Math.PI); box.group.scale.set(1 + k * .03, 1 - k * .04, 1 + k * .03); }, ease.outCubic);
    box.group.scale.set(1, 1, 1);
  }
  function reset() { capPose(0); spraying = false; state.zoom = 0; Object.assign(state, { lid: 0, flaps: 0, rise: 0, out: 0, squash: 0, pop: 0, tape: 0, rotY: 0, rotX: 0, vel: 0 }); sprayT = 0; mist.particles.forEach(p => { p.life = 0; }); applyPose(); }

  function boxRect() {
    const r = host.getBoundingClientRect();
    const project = v => { const q = v.clone().project(camera); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height }; };
    const a = project(new THREE.Vector3(BOX_X - BOX.w / 2, BOX.h, BOX.d / 2)), b = project(new THREE.Vector3(BOX_X + BOX.w / 2, 0, BOX.d / 2));
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  function dispose() {
    renderer.setAnimationLoop(null); ro.disconnect(); themeObs.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    host.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
    host.removeEventListener('keydown', onKey);
    scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
  }

  const api = { setProduct, setVariant, open, close, pack, spray, reset, boxRect, dispose, resize, get product() { return current; }, get debug() { return { spraying, sprayable: model && model.userData.sprayable, hasCap: !!(model && model.userData.cap), out: state.out, reduced: REDUCED() }; } };
  host._assafApi = api;
  return api;
}
