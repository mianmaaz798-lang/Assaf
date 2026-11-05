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
  const camHome = new THREE.Vector3(0, 2.3, 10.2), look = new THREE.Vector3(0, 1.7, 0);

  // key light with soft shadows + gentle fill
  const key = new THREE.DirectionalLight('#fff7ec', 2.2);
  key.position.set(3.2, 7, 4.2); key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 4; key.shadow.camera.bottom = -2;
  key.shadow.radius = 10; key.shadow.blurSamples = 16; key.shadow.bias = -.0004; key.shadow.normalBias = .02;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffe9c7', .9); rim.position.set(-4, 4, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9bfae', .35));

  // ground: shadow catcher + soft contact shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .16 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = .002; scene.add(contact);

  const logo = await loadImage(new URL('../img/logo.png', import.meta.url).href);
  const mf = await manifest();
  const customFront = mf.boxFront ? await loadImage(new URL('../models/' + mf.boxFront, import.meta.url).href) : null;
  const customLid = mf.boxLid ? await loadImage(new URL('../models/' + mf.boxLid, import.meta.url).href) : null;
  const texFrom = img => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };

  let frontTex = customFront ? texFrom(customFront) : boxFrontTexture(logo, product.name, renderer);
  const box = makeBox(frontTex, customLid ? texFrom(customLid) : lidTexture(logo, renderer));
  scene.add(box.group);

  // product turntable: spin group (user rotation) > lift group (rise/sink) > bottle
  const lift = new THREE.Group(), spin = new THREE.Group();
  lift.add(spin); scene.add(lift);
  let bottle = null, current = product, variantIdx = opts.variant || 0;

  const state = { lid: 0, flaps: 0, rise: 0, tape: 0, rotY: -.35, rotX: 0, vel: 0, auto: true, lastUser: 0, cam: 0 };
  const RISE_TOP = BOX.h * .9;
  host._assafStage = state; // handy for debugging / tests   // most of the bottle clears the rim so the label shows

  function applyPose() {
    box.lidPivot.rotation.x = -state.lid * 2.05;            // ~117°
    box.flaps[0].rotation.z = -state.flaps * 1.75;
    box.flaps[1].rotation.z = state.flaps * 1.75;
    lift.position.y = lerp(.04, RISE_TOP, state.rise);
    box.tape.visible = state.tape > 0;
    box.tape.scale.z = Math.max(.001, state.tape);
    box.tape.position.z = BOX.d / 2 + .1 - (1 - state.tape) * (BOX.d / 2 + .13);
    spin.rotation.y = state.rotY;
    spin.rotation.x = state.rotX;
    camera.position.lerpVectors(camHome, new THREE.Vector3(0, 2.6, 9.4), state.cam);
    camera.lookAt(look.x, look.y + state.cam * .45, look.z);
  }

  async function setProduct(p, vIdx = 0) {
    current = p; variantIdx = vIdx;
    if (bottle) { spin.remove(bottle); bottle.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
    bottle = (await tryLoadGLB(p)) || placeholderBottle(p, renderer);
    spin.add(bottle);
    if (!customFront) {
      const old = frontTex; frontTex = boxFrontTexture(logo, p.name, renderer);
      box.group.traverse(o => { if (o.isMesh && Array.isArray(o.material) && o.material[4] && o.material[4].map === old) o.material[4].map = frontTex; });
      old.dispose();
    }
    setVariant(vIdx, true);
  }
  function setVariant(i, instant) {
    variantIdx = i;
    const v = current.variants && current.variants[i];
    const target = sizeScale(v);
    if (bottle && bottle.userData.placeholder) {
      const lm = bottle.userData.labelMat; if (lm.map) lm.map.dispose();
      lm.map = labelTexture(current, v, renderer); lm.needsUpdate = true;
    }
    const from = spin.scale.x || 1;
    if (instant) { spin.scale.setScalar(target); return Promise.resolve(); }
    return tween(520, t => spin.scale.setScalar(lerp(from, target, t)), ease.outBack);
  }

  // drag to rotate (pointer + inertia), arrow keys for keyboard users
  let dragging = false, lastX = 0, lastY = 0;
  const onDown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; state.vel = 0; host.classList.add('dragging', 'interacted'); host.setPointerCapture && host.setPointerCapture(e.pointerId); };
  const onMove = e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    state.rotY += dx * .011; state.vel = dx * .011;
    state.rotX = Math.max(-.35, Math.min(.35, state.rotX + dy * .004));
    state.lastUser = performance.now();
  };
  const onUp = () => { dragging = false; host.classList.remove('dragging'); state.lastUser = performance.now(); };
  const onKey = e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); state.rotY += (k === 'ArrowLeft' ? -1 : 1) * Math.PI / 12; state.lastUser = performance.now(); host.classList.add('interacted'); }
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); state.rotX = Math.max(-.35, Math.min(.35, state.rotX + (k === 'ArrowUp' ? -.08 : .08))); state.lastUser = performance.now(); }
  };
  host.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  host.addEventListener('keydown', onKey);

  // render loop (paused when the tab is hidden)
  let last = performance.now(), running = true;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!dragging) {
      state.rotY += state.vel; state.vel *= .92;
      const idle = now - state.lastUser > 2600;
      if (state.auto && idle && state.rise > .9 && !REDUCED()) state.rotY += dt * .45;
      if (idle) state.rotX *= .96;
    }
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
    camera.aspect = w / h;
    // keep the box + risen bottle in frame on tall/narrow viewers
    camera.fov = w / h < .85 ? 34 : 28;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  await setProduct(product, variantIdx);
  applyPose(); renderer.render(scene, camera);

  /* ---------------- choreography */
  async function open() {
    state.auto = true;
    await Promise.all([
      tween(760, t => { state.lid = t; }, ease.outBack),
      tween(560, t => { state.flaps = t; }, ease.outBack, 240),
      tween(900, t => { state.cam = t; }, ease.inOutCubic),
      tween(980, t => { state.rise = t; }, ease.outCubic, 380),
      tween(980, t => { state.rotY = -.35 + t * .5; }, ease.outCubic, 380),
    ]);
  }
  async function settleRotation() {
    const from = state.rotY, to = Math.round(from / (Math.PI * 2)) * Math.PI * 2, fx = state.rotX;
    state.vel = 0;
    await tween(420, t => { state.rotY = lerp(from, to, t); state.rotX = lerp(fx, 0, t); }, ease.inOutCubic);
  }
  async function close() {
    state.auto = false;
    await settleRotation();
    await tween(560, t => { state.rise = 1 - t; }, ease.inOutCubic);
    await Promise.all([
      tween(320, t => { state.flaps = 1 - t; }, ease.inOutCubic),
      tween(520, t => { state.lid = 1 - t; }, ease.inOutCubic, 120),
      tween(640, t => { state.cam = 1 - t; }, ease.inOutCubic),
    ]);
  }
  async function pack() {
    await close();
    await tween(420, t => { state.tape = t; }, ease.outCubic);
    // small settle: the box squashes as the seal presses down
    await tween(260, t => { const s = Math.sin(t * Math.PI); box.group.scale.set(1 + s * .03, 1 - s * .04, 1 + s * .03); }, ease.outCubic);
    box.group.scale.set(1, 1, 1);
  }
  function reset() { Object.assign(state, { lid: 0, flaps: 0, rise: 0, tape: 0, rotY: -.35, rotX: 0, vel: 0, cam: 0 }); applyPose(); }

  function boxRect() {
    const r = host.getBoundingClientRect();
    const project = v => { const p = v.clone().project(camera); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; };
    const a = project(new THREE.Vector3(-BOX.w / 2, BOX.h, BOX.d / 2)), b = project(new THREE.Vector3(BOX.w / 2, 0, BOX.d / 2));
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

  return { setProduct, setVariant, open, close, pack, reset, boxRect, dispose, resize, get product() { return current; } };
}
