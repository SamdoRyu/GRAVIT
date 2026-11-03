// 우주정거장 3D 씬 (디자인 캔버스 StationScene에서 그대로 옮김)
// three r150 기준. 뷰: 'default' | 'blocked' | 'scanner' | 'bridge'
// opts: { view, onLabels(labels), onSelect(id), onError(err), avatarUrl }
import * as THREE from 'three';
import { replaceAstronaut } from '../stationAvatar.js';

export function createStation(canvas, opts = {}) {
  const ctx = { _canvas: canvas };
  let T = THREE;
  const W = canvas.clientWidth || 1440, H = canvas.clientHeight || 900, PI = Math.PI;
  // 폴리곤 수를 조금씩 늘린다 (도형 규칙상 각이 정해진 삼각기둥·사각 선체·팔면체는 그대로).
  const T0 = T, PF = 1.5;
  const up = (n, min) => (n == null ? n : (n >= min ? Math.round(n * PF) : n));
  T = Object.assign({}, T0);
  T.CylinderGeometry = function (rt, rb, h, rs, hs, open, ts, tl) { return new T0.CylinderGeometry(rt, rb, h, up(rs, 6), hs, open, ts, tl); };
  T.ConeGeometry = function (r, h, rs, hs, open, ts, tl) { return new T0.ConeGeometry(r, h, up(rs, 6), hs, open, ts, tl); };
  T.TorusGeometry = function (r, tube, rs, ts, arc) { return new T0.TorusGeometry(r, tube, up(rs, 4), up(ts, 6), arc); };
  T.SphereGeometry = function (r, ws, hs, ps, pl, tst, tl) { return new T0.SphereGeometry(r, up(ws, 6), up(hs, 4), ps, pl, tst, tl); };
  T.CapsuleGeometry = function (r, l, cs, rs) { return new T0.CapsuleGeometry(r, l, up(cs, 2), up(rs, 6)); };
  T.CircleGeometry = function (r, s, ts, tl) { return new T0.CircleGeometry(r, up(s, 8), ts, tl); };
  T.RingGeometry = function (ir, or, ts, ps, a, b) { return new T0.RingGeometry(ir, or, up(ts, 8), ps, a, b); };
  T.IcosahedronGeometry = function (r, d) { return new T0.IcosahedronGeometry(r, (d || 0) + 1); };
  const view = opts.view || 'default';
  const bridgeMode = view === 'bridge';
  const dimAmt = view === 'blocked' ? 0.6 : view === 'scanner' ? 0.42 : 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const renderer = new T.WebGLRenderer({ canvas: ctx._canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.autoClear = false;
  ctx._renderer = renderer;

  const scene = new T.Scene();
  scene.fog = new T.Fog(0x1a1e50, bridgeMode ? 60 : 100, bridgeMode ? 220 : 340);
  const station = new T.Group();
  station.position.set(-28, 0, -20);
  scene.add(station);
  const anim = [];
  const L = [];
  const Wp = (x, y, z) => new T.Vector3(x - 28, y, z - 20);
  const lab = (kind, p, o) => L.push(Object.assign({ kind: kind, p: p }, o || {}));
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const HULL = 0xc2b3d8, FLOOR = 0xe6dccb, SKIN = 0xe9e0cf, TRIM = 0xf29a52, TEAL = 0x8ff0e0, LAMP = 0xffd58a, CARGO = 0xf1e4cc, METAL = 0x9f93b8, FRAME = 0xd8ccb6;
  const YC = 3.2;
  const cache = {};
  const lam = (c, extra) => {
    const k = c + '|' + (extra ? JSON.stringify(Object.keys(extra).map(x => [x, String(extra[x])])) : '');
    if (!cache[k]) cache[k] = new T.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, extra || {}));
    return cache[k];
  };
  const basic = (c, extra) => new T.MeshBasicMaterial(Object.assign({ color: c }, extra || {}));
  const shadeOne = (c) => {
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    c.castShadow = !ms.some(m => m.transparent || m.isMeshBasicMaterial);
    c.receiveShadow = !ms.every(m => m.isMeshBasicMaterial);
  };
  const mesh = (geo, mat, x, y, z, parent) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    shadeOne(m);
    (parent || station).add(m);
    return m;
  };
  const bx = (w, h, d, mat, x, y, z, parent) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const shade = (g) => g.traverse(c => { if (c.isMesh) shadeOne(c); });
  const hl = (o) => o.traverse(c => c.layers.enable(1));
  const UP = new T.Vector3(0, 1, 0);
  const strut = (a, b, r, mat) => {
    const d = new T.Vector3().subVectors(b, a), len = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 6), mat || lam(FRAME));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    shadeOne(m); scene.add(m);
    return m;
  };

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const glow = (color, size, x, y, z, parent, op, noFog) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: op == null ? 0.8 : op, blending: T.AdditiveBlending, depthWrite: false, fog: !noFog }));
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    (parent || station).add(s);
    return s;
  };

  // ---------- 카메라와 조작 ----------
  const cam = new T.PerspectiveCamera(30, W / H, 0.5, 3000);
  cam.setViewOffset(W, H, 188, -20, W, H);
  const home = bridgeMode
    ? { az: PI / 4, el: 26 * PI / 180, dist: 38, target: Wp(12, 2.2, 12) }
    : { az: PI / 4, el: 22 * PI / 180, dist: 122, target: Wp(30, 3, 20) };
  const minD = bridgeMode ? 18 : 40, maxD = bridgeMode ? 90 : 220;
  const ctl = { az: home.az, el: home.el, dist: home.dist, target: home.target.clone() };
  const goal = { az: home.az, el: home.el, dist: home.dist };
  let dirty = true;
  const applyCam = () => {
    const ce = Math.cos(ctl.el);
    cam.position.set(ctl.target.x + ctl.dist * ce * Math.sin(ctl.az), ctl.target.y + ctl.dist * Math.sin(ctl.el), ctl.target.z + ctl.dist * ce * Math.cos(ctl.az));
    cam.lookAt(ctl.target);
    cam.updateMatrixWorld();
  };
  ctx._reset = () => { goal.az = home.az + Math.round((ctl.az - home.az) / (2 * PI)) * 2 * PI; goal.el = home.el; goal.dist = home.dist; dirty = true; };
  const cv = ctx._canvas;
  let drag = null;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, az: goal.az, el: goal.el }; try { cv.setPointerCapture(e.pointerId); } catch (err) {} cv.style.cursor = 'grabbing'; };
  const onMove = (e) => {
    if (!drag) return;
    const sc = (cv.getBoundingClientRect().width || W) / W;
    goal.az = drag.az - (e.clientX - drag.x) / sc * 0.008;
    goal.el = clamp(drag.el + (e.clientY - drag.y) / sc * 0.006, 4 * PI / 180, 78 * PI / 180);
    dirty = true;
  };
  const onUp = (e) => {
    const moved = drag && e ? Math.hypot(e.clientX - drag.x, e.clientY - drag.y) : 99;
    drag = null; cv.style.cursor = 'grab';
    if (moved < 5 && ctx._pick) ctx._pick(e);
  };
  const onWheel = (e) => { e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0012), minD, maxD); dirty = true; };
  const onDbl = () => ctx._reset();
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('dblclick', onDbl);
  ctx._unbind = () => {
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    cv.removeEventListener('wheel', onWheel);
    cv.removeEventListener('dblclick', onDbl);
  };

  // ---------- 조명 (카메라를 따라 도는 스튜디오 조명 + 행성 반사광) ----------
  const lights = [];
  const hemi = new T.HemisphereLight(0xcfd8ff, 0x8f7cc6, 0.55); lights.push(hemi);
  const key = new T.DirectionalLight(0xfff0dc, 0.95);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sr = bridgeMode ? 18 : 56;
  key.shadow.camera.left = -sr; key.shadow.camera.right = sr; key.shadow.camera.top = sr; key.shadow.camera.bottom = -sr;
  key.shadow.camera.near = 1; key.shadow.camera.far = 280;
  key.shadow.bias = -0.0006;
  lights.push(key);
  const rimA = new T.DirectionalLight(0x9fe8ff, 0.6); lights.push(rimA);
  const rimB = new T.DirectionalLight(0xc9a8ff, 0.45); lights.push(rimB);
  const bounce = new T.DirectionalLight(0xf6a9c0, 0.45); lights.push(bounce);
  const lt = new T.Object3D(); scene.add(lt);
  lights.forEach(l => { scene.add(l); l.layers.enable(1); if (l.target) l.target = lt; });
  const updLights = () => {
    lt.position.copy(ctl.target);
    const s = Math.sin(ctl.az), c = Math.cos(ctl.az);
    const right = new T.Vector3(c, 0, -s), back = new T.Vector3(s, 0, c);
    key.position.copy(ctl.target).addScaledVector(right, -50).addScaledVector(back, 38).add(new T.Vector3(0, 80, 0));
    rimA.position.copy(ctl.target).addScaledVector(back, -60).addScaledVector(right, 34).add(new T.Vector3(0, 26, 0));
    rimB.position.copy(ctl.target).addScaledVector(back, -60).addScaledVector(right, -40).add(new T.Vector3(0, 8, 0));
    bounce.position.copy(ctl.target).add(new T.Vector3(0, -60, 0)).addScaledVector(back, 12);
  };

  // ---------- 우주 배경 ----------
  const sp = [];
  for (let i = 0; i < 1600; i++) {
    const u = rnd() * 2 - 1, th = rnd() * PI * 2, r = Math.sqrt(1 - u * u);
    sp.push(r * Math.cos(th) * 900, u * 900, r * Math.sin(th) * 900);
  }
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
  const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
  scene.add(stars);
  const sp2 = [];
  for (let i = 0; i < 160; i++) {
    const u = rnd() * 2 - 1, th = rnd() * PI * 2, r = Math.sqrt(1 - u * u);
    sp2.push(r * Math.cos(th) * 880, u * 880, r * Math.sin(th) * 880);
  }
  const sg2 = new T.BufferGeometry(); sg2.setAttribute('position', new T.Float32BufferAttribute(sp2, 3));
  const stars2 = new T.Points(sg2, new T.PointsMaterial({ color: 0xfff1de, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  scene.add(stars2);
  [[0x6a55b0, 20, 0.0, 0.45], [0x2f8f96, 110, -0.05, 0.32], [0x8d5aa8, 200, 0.1, 0.36], [0xc36f9a, 290, -0.1, 0.24], [0x5a6fd0, 330, 0.25, 0.25], [0x2f8f96, 160, 0.3, 0.2]].forEach(n => {
    const a = n[1] * PI / 180;
    const d = new T.Vector3(Math.sin(a), n[2], Math.cos(a)).normalize().multiplyScalar(800);
    glow(n[0], 900, d.x, d.y, d.z, scene, n[3], true);
  });
  const PC = new T.Vector3(0, -236, 0), PR = 200;
  const pg = new T.IcosahedronGeometry(PR, 4);
  const pp = pg.attributes.position;
  const pal = [0xffe3cf, 0xf6b9b0, 0xe7a3c0, 0xc4a2dc, 0x9f8ad0].map(c => new T.Color(c));
  const cols = [];
  for (let i = 0; i < pp.count; i += 3) {
    const x = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3;
    const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3;
    const z = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3;
    const band = Math.sin(y * 0.035 + Math.sin(x * 0.018 + z * 0.014) * 1.3);
    const idx = clamp(Math.floor((band * 0.5 + 0.5) * pal.length), 0, pal.length - 1);
    for (let j = 0; j < 3; j++) cols.push(pal[idx].r, pal[idx].g, pal[idx].b);
  }
  pg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  const planet = new T.Mesh(pg, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
  planet.position.copy(PC); planet.rotation.z = 0.3;
  scene.add(planet);
  anim.push(t => { planet.rotation.y = t * 0.006; });
  const atmo = new T.Mesh(new T.SphereGeometry(PR * 1.045, 64, 40), basic(0xf7c1d9, { transparent: true, opacity: 0.22, side: T.BackSide, depthWrite: false, fog: false, blending: T.AdditiveBlending }));
  atmo.position.copy(PC); scene.add(atmo);
  const op = [];
  const oa = new T.Vector3(1, 0, -1).normalize(), ob = new T.Vector3(0, 1, 0);
  for (let i = 0; i <= 480; i++) {
    const th = i / 480 * PI * 2;
    op.push(PC.clone().addScaledVector(oa, 230 * Math.cos(th)).addScaledVector(ob, 230 * Math.sin(th)));
  }
  scene.add(new T.Line(new T.BufferGeometry().setFromPoints(op), new T.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.5, fog: false })));

  // ---------- 공용 부품 ----------
  const thruster = (x, y, z, g, size) => {
    const s = size || 1;
    const n = new T.ConeGeometry(0.55 * s, 0.8 * s, 8); n.rotateX(PI);
    mesh(n, lam(METAL), x, y, z, g);
    const fl = glow(TEAL, 2.6 * s, x, y - 0.7 * s, z, g, 0.7);
    anim.push(t => { fl.material.opacity = 0.45 + 0.25 * Math.sin(t * 11 + x + z); });
  };
  const consoleAt = (px, pz, ry, y) => {
    const g = new T.Group(); g.position.set(px, y, pz); g.rotation.y = ry || 0; station.add(g);
    const b = new T.Mesh(new T.BoxGeometry(2.0, 1.0, 0.8), lam(0xe6dbc6)); b.position.y = 0.5; g.add(b);
    const dk = new T.Mesh(new T.BoxGeometry(2.2, 0.12, 1.1), lam(0xf1e9da)); dk.position.set(0, 1.05, 0.1); g.add(dk);
    const sc = new T.Mesh(new T.BoxGeometry(1.8, 0.95, 0.1), lam(0x2a3a6a)); sc.position.set(0, 1.7, -0.25); sc.rotation.x = -0.2; g.add(sc);
    const gl = new T.Mesh(new T.PlaneGeometry(1.6, 0.75), basic(0x7fe0d2)); gl.position.set(0, 1.71, -0.19); gl.rotation.x = -0.2; g.add(gl);
    shade(g);
    return g;
  };
  const rack = (px, pz, y) => {
    const g = new T.Group(); g.position.set(px, y, pz); station.add(g);
    const m = lam(0xe2d7c1);
    const add = (geo, mat, x, yy, z) => { const k = new T.Mesh(geo, mat); k.position.set(x, yy, z); g.add(k); };
    add(new T.BoxGeometry(0.12, 3.2, 3.6), lam(0xd2c4ab), -0.55, 1.6, 0);
    [-1.73, 1.73].forEach(z => add(new T.BoxGeometry(0.14, 3.2, 0.14), m, 0.55, 1.6, z));
    [0.05, 1.1, 2.15, 3.15].forEach(yy => add(new T.BoxGeometry(1.2, 0.1, 3.6), m, 0, yy, 0));
    add(new T.BoxGeometry(0.8, 0.7, 0.9), lam(TRIM), 0, 0.45, -0.9);
    add(new T.BoxGeometry(0.8, 0.7, 1.1), lam(0xdcd0bc), 0, 1.5, 0.8);
    add(new T.BoxGeometry(0.8, 0.6, 0.8), lam(0xdcd0bc), 0, 2.5, -0.5);
    shade(g);
  };
  const cargo = (k, s) => {
    const g = new T.Group();
    const add = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    if (k === 'holo') {
      add(new T.BoxGeometry(s, s, s), basic(TEAL, { transparent: true, opacity: 0.22, depthWrite: false }), s / 2);
      const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(s, s, s)), new T.LineBasicMaterial({ color: 0xc4fff4 }));
      e.position.y = s / 2; g.add(e);
      anim.push(t => { g.rotation.y = t * 0.5; g.position.y = (g.userData.y0 || 0) + 0.08 * Math.sin(t * 2); });
    } else if (k === 'cube') {
      add(new T.BoxGeometry(s, s, s), lam(CARGO), s / 2);
      add(new T.BoxGeometry(s * 1.04, s * 0.16, s * 1.04), lam(TRIM), s * 0.45);
    } else if (k === 'prism') {
      const r = s * 0.62;
      const g1 = new T.CylinderGeometry(r, r, s * 1.3, 3); g1.rotateZ(PI / 2); g1.rotateX(-PI / 2);
      add(g1, lam(CARGO), r * 0.5);
      const g2 = new T.CylinderGeometry(r * 1.04, r * 1.04, s * 0.16, 3); g2.rotateZ(PI / 2); g2.rotateX(-PI / 2);
      add(g2, lam(TRIM), r * 0.5);
    } else if (k === 'sphere') {
      add(new T.IcosahedronGeometry(s * 0.52, 1), lam(CARGO), s * 0.56);
      add(new T.SphereGeometry(s * 0.1, 8, 6), basic(0xff9d4d), s * 1.12);
      const halo = glow(0xffb36b, s * 2.6, 0, s * 0.6, 0, g, 0.4);
      anim.push(t => { halo.material.opacity = 0.12 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.6)); });
    } else if (k === 'octa') {
      const geo = new T.OctahedronGeometry(s * 0.5); geo.scale(1, 1.4, 1);
      const m = add(geo, lam(CARGO, { emissive: 0x2a2030 }), s * 0.95);
      glow(0xd9c6ff, s * 1.8, 0, s * 0.95, 0, g, 0.35);
      anim.push(t => { m.rotation.y = t * 0.8; m.position.y = s * (0.95 + 0.08 * Math.sin(t * 1.7)); });
    } else if (k === 'pad') {
      add(new T.BoxGeometry(s * 1.1, s * 0.1, s * 0.8), lam(CARGO), s * 0.2);
      for (let i = 0; i < 3; i++) {
        const ln = add(new T.BoxGeometry(s * (i === 2 ? 0.45 : 0.75), s * 0.02, s * 0.07), basic(0x8fa4c4), s * 0.26);
        ln.position.x = i === 2 ? -s * 0.15 : 0; ln.position.z = -s * 0.2 + i * s * 0.2;
      }
    }
    shade(g);
    return g;
  };
  const put = (k, s, px, pz, y, parent) => {
    const g = cargo(k, s);
    g.position.set(px, y || 0, pz); g.userData.y0 = y || 0;
    (parent || station).add(g);
    return g;
  };
  const crew = (color, px, pz, ry, sc, y) => {
    const g = new T.Group();
    const suit = lam(0xf3eee4), acc = lam(color);
    const add = (geo, mat, x, yy, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, yy, z); g.add(m); return m; };
    [-0.2, 0.2].forEach(x => add(new T.CylinderGeometry(0.17, 0.19, 0.55, 6), suit, x, 0.28, 0));
    add(new T.CapsuleGeometry(0.42, 0.4, 3, 8), suit, 0, 1.0, 0);
    add(new T.CylinderGeometry(0.45, 0.45, 0.14, 8), acc, 0, 0.92, 0);
    add(new T.BoxGeometry(0.62, 0.7, 0.32), lam(0xd6cbb9), 0, 1.08, -0.42);
    [-1, 1].forEach(sd => { const a = add(new T.CapsuleGeometry(0.13, 0.36, 3, 6), suit, sd * 0.55, 0.98, 0.05); a.rotation.z = sd * 0.35; });
    add(new T.IcosahedronGeometry(0.52, 1), lam(0xfdfaf3), 0, 1.85, 0);
    add(new T.SphereGeometry(0.47, 12, 8, PI / 2 - 0.85, 1.7, 1.0, 0.95), lam(0x27305e, { side: T.DoubleSide, emissive: 0x0d1a3a }), 0, 1.85, 0.08);
    const ear = add(new T.CylinderGeometry(0.13, 0.13, 0.12, 8), acc, 0.53, 1.85, 0); ear.rotation.z = PI / 2;
    shade(g);
    g.position.set(px, y, pz); g.rotation.y = ry; g.scale.setScalar(sc);
    station.add(g);
    return g;
  };
  const ringAt = (px, pz, r, color, y) => {
    const geo = new T.RingGeometry(r, r + 0.2, 40); geo.rotateX(-PI / 2);
    const m = new T.Mesh(geo, basic(color, { transparent: true, opacity: 0.95, side: T.DoubleSide, depthTest: false }));
    m.position.set(px, y + 0.1, pz); station.add(m); m.layers.set(1);
    anim.push(t => { const k = 1 + 0.12 * Math.sin(t * 3); m.scale.set(k, 1, k); });
  };
  const panel = (x, y, z, w, d) => {
    bx(w + 0.4, 0.14, d + 0.4, lam(0xece2cf), x, y - 0.12, z);
    bx(w, 0.12, d, lam(0x2c4a7c, { emissive: 0x0a1630 }), x, y, z);
    for (let i = 1; i < 5; i++) bx(0.06, 0.03, d, basic(0x7ea6d8), x - w / 2 + i * w / 5, y + 0.08, z);
    bx(w, 0.03, 0.06, basic(0x7ea6d8), x, y + 0.08, z);
  };
  const tubeMat = lam(0xe4d9c5), ribMat = lam(0xc9b9a0);
  const tube = (axis, a0, a1, f) => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const geo = new T.CylinderGeometry(1.0, 1.0, len, 10);
    if (axis === 'x') geo.rotateZ(PI / 2); else geo.rotateX(PI / 2);
    mesh(geo, tubeMat, axis === 'x' ? mid : f, YC, axis === 'x' ? f : mid);
    for (let s = a0 + 0.8; s < a1 - 0.4; s += 1.6) {
      const rg = new T.TorusGeometry(1.06, 0.1, 5, 12);
      if (axis === 'x') rg.rotateY(PI / 2);
      mesh(rg, ribMat, axis === 'x' ? s : f, YC, axis === 'x' ? f : s);
    }
    [1, -1].forEach(sd => {
      if (axis === 'x') bx(len - 0.8, 0.2, 0.06, basic(LAMP), mid, YC + 0.15, f + sd * 1.0);
      else bx(0.06, 0.2, len - 0.8, basic(LAMP), f + sd * 1.0, YC + 0.15, mid);
    });
  };

  // ---------- 컷어웨이 원통 모듈 ----------
  // 선체 일부가 항상 카메라 쪽으로 열려 있어 어느 각도에서든 내부가 보인다.
  const MODS = [];
  const skinOut = lam(SKIN), skinIn = lam(0xf2e8d6, { side: T.BackSide }), armorOut = lam(0xd2c8b6);
  const bandMat = lam(0xc9bca4, { side: T.DoubleSide }), cutMat = basic(0xf6c79a);
  const capMat = lam(0xe2d8c5, { side: T.DoubleSide }), armorCap = lam(0xc8bdaa, { side: T.DoubleSide });
  const module = (o) => {
    const R = o.R, len = o.len;
    const g = new T.Group(); g.position.set(o.x, YC, o.z); if (o.axis === 'z') g.rotation.y = PI / 2; station.add(g);
    const shell = new T.Group(); g.add(shell);
    const cut = (o.cut || 150) * PI / 180, th = 2 * PI - cut;
    const sgeo = new T.CylinderGeometry(R, R, len, 32, 1, true, cut / 2, th); sgeo.rotateZ(PI / 2);
    const outer = new T.Mesh(sgeo, o.armor ? armorOut : skinOut); outer.castShadow = true; outer.receiveShadow = true; shell.add(outer);
    const inner = new T.Mesh(sgeo, skinIn); inner.receiveShadow = true; shell.add(inner);
    const nb = Math.max(2, Math.round(len / (o.armor ? 2.2 : 3)));
    for (let i = 0; i <= nb; i++) {
      const bg = new T.CylinderGeometry(R + 0.14, R + 0.14, o.armor ? 0.7 : 0.36, 32, 1, true, cut / 2, th); bg.rotateZ(PI / 2);
      const b = new T.Mesh(bg, bandMat); b.position.x = -len / 2 + i * len / nb; b.castShadow = true; shell.add(b);
    }
    [cut / 2, -cut / 2].forEach(a => {
      const e = new T.Mesh(new T.BoxGeometry(len, 0.14, 0.32), cutMat);
      e.position.set(0, R * Math.sin(a), R * Math.cos(a)); e.rotation.x = -a; shell.add(e);
    });
    const lamp = new T.Mesh(new T.BoxGeometry(len * 0.8, 0.14, 0.06), basic(LAMP)); lamp.position.set(0, R * 0.25, -R * 0.96); shell.add(lamp);
    const nw = Math.max(1, Math.floor(len / 3.5));
    for (let i = 0; i < nw; i++) {
      const thW = PI - 0.62, x = -len / 2 + (i + 0.5) * len / nw;
      const ph = new T.Group(); ph.position.set(x, R * 0.97 * Math.sin(thW), R * 0.97 * Math.cos(thW)); ph.rotation.x = PI - thW; shell.add(ph);
      ph.add(new T.Mesh(new T.TorusGeometry(0.55, 0.12, 6, 14), lam(0xfff4e2)));
      const gl = new T.Mesh(new T.CircleGeometry(0.55, 14), basic(0x2a3170)); gl.position.z = 0.01; ph.add(gl);
      const gt = new T.Mesh(new T.CircleGeometry(0.12, 8), basic(0xbfe9ff)); gt.position.set(-0.22, 0.22, 0.02); ph.add(gt);
    }
    const caps = [1, -1].map(s => {
      const cg = new T.SphereGeometry(R, 24, 10, 0, 2 * PI, 0, PI / 2); cg.rotateZ(-s * PI / 2); cg.scale(0.42, 1, 1);
      const c = new T.Mesh(cg, o.armor ? armorCap : capMat); c.position.x = s * len / 2; c.castShadow = true; c.receiveShadow = true; g.add(c);
      const ring = new T.TorusGeometry(R + 0.06, o.armor ? 0.32 : 0.22, 6, 32); ring.rotateY(PI / 2);
      const rm = new T.Mesh(ring, bandMat); rm.position.x = s * len / 2; rm.castShadow = true; g.add(rm);
      glow(s > 0 ? 0xff8f7a : 0x8ff0e0, 1.2, s * (len / 2 + R * 0.42 + 0.1), 0, 0, g, 0.9);
      return { m: c, s: s };
    });
    const dy = -R * 0.55, dw = 2 * R * 0.83;
    const deck = new T.Mesh(new T.BoxGeometry(len + 0.3, 0.16, dw), lam(FLOOR)); deck.position.y = dy; deck.receiveShadow = true; g.add(deck);
    const keel = new T.Mesh(new T.BoxGeometry(len * 0.75, 0.5, 0.9), lam(METAL)); keel.position.y = -R - 0.15; keel.castShadow = true; g.add(keel);
    [-len * 0.25, len * 0.25].forEach(x => thruster(x, -R - 0.55, 0, g, 0.8));
    const pl = new T.PointLight(0xffd9a0, 0.55, R * 4.5); pl.position.set(0, R * 0.2, 0); g.add(pl); pl.layers.enable(1);
    const md = { g: g, shell: shell, caps: caps, beta: 1.0, deckY: YC + dy + 0.08 };
    MODS.push(md);
    return md;
  };

  // ---------- A. 지휘 브리지 (유리 돔 원반) ----------
  const BR = new T.Group(); BR.position.set(12, 0, 12); station.add(BR);
  mesh(new T.CylinderGeometry(7.2, 4.4, 1.9, 24), lam(HULL), 0, -0.85, 0, BR);
  const sauc = new T.TorusGeometry(7.4, 0.45, 6, 32); sauc.rotateX(PI / 2);
  mesh(sauc, bandMat, 0, -0.1, 0, BR);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2;
    glow(i % 2 ? 0xff8f7a : TEAL, 1.0, Math.cos(a) * 7.9, -0.1, Math.sin(a) * 7.9, BR, 0.85);
  }
  mesh(new T.CylinderGeometry(7.32, 7.32, 0.2, 24), lam(0xeee4d2), 0, 0.0, 0, BR);
  mesh(new T.CylinderGeometry(7.0, 7.0, 0.1, 24), lam(FLOOR), 0, 0.15, 0, BR);
  thruster(0, -2.0, 0, BR, 1.3);
  const rg1 = new T.RingGeometry(4.6, 4.9, 40); rg1.rotateX(-PI / 2);
  mesh(rg1, basic(0xa8e6dc), 0, 0.21, 0, BR);
  mesh(new T.CylinderGeometry(7.2, 7.2, 1.0, 24, 1, true), lam(SKIN, { side: T.DoubleSide }), 0, 0.6, 0, BR);
  mesh(new T.CylinderGeometry(3.0, 3.3, 1.2, 10), lam(0xe6dac3), 0, 0.7, 0, BR);
  mesh(new T.CylinderGeometry(3.32, 3.32, 0.14, 10), lam(TRIM), 0, 0.45, 0, BR);
  mesh(new T.CylinderGeometry(3.0, 3.0, 0.08, 10), basic(0x1b3154), 0, 1.34, 0, BR);
  const tr = new T.TorusGeometry(2.95, 0.07, 4, 40); tr.rotateX(PI / 2);
  mesh(tr, basic(TEAL), 0, 1.39, 0, BR);
  const tg = new T.RingGeometry(1.6, 1.66, 40); tg.rotateX(-PI / 2);
  mesh(tg, basic(TEAL, { transparent: true, opacity: 0.5 }), 0, 1.4, 0, BR);
  mesh(new T.CylinderGeometry(3.6, 2.95, 3.6, 40, 1, true), basic(TEAL, { transparent: true, opacity: 0.08, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }), 0, 3.2, 0, BR);
  glow(TEAL, 7, 0, 1.6, 0, BR, 0.35);
  const agenda = [
    { k: 'cube', a: 165, id: 'reopen' }, { k: 'prism', a: 225, id: 'pr' }, { k: 'sphere', a: 285, id: 'help' },
    { k: 'octa', a: 345, id: 'learn' }, { k: 'pad', a: 45, id: 'decide' }, { k: 'holo', a: 105, id: 'cand' }
  ];
  const AG = {};
  agenda.forEach(it => {
    const ar = it.a * PI / 180, r = 2.0;
    const px = Math.cos(ar) * r, pz = Math.sin(ar) * r;
    const g = put(it.k, 0.95, px, pz, it.k === 'holo' ? 1.55 : 1.38, BR);
    if (it.k === 'prism') g.rotation.y = PI / 4;
    if (it.k === 'pad') g.rotation.y = -PI / 4;
    AG[it.id] = { x: 12 + px, z: 12 + pz };
  });
  const orbitG = new T.Group(); orbitG.position.set(AG.reopen.x - 12, 1.88, AG.reopen.z - 12); BR.add(orbitG);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * PI * 2;
    const dd = new T.Mesh(new T.BoxGeometry(0.28, 0.06, 0.08), basic(0xffb36b));
    dd.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95); dd.rotation.y = -a + PI / 2; orbitG.add(dd);
  }
  anim.push(t => { orbitG.rotation.y = t * 0.9; });
  const dome = mesh(new T.SphereGeometry(7.2, 24, 10, 0, PI * 2, 0, PI / 2), lam(0xd8f3f7, { transparent: true, opacity: bridgeMode ? 0.08 : 0.15, depthWrite: false, side: T.DoubleSide }), 0, 0.1, 0, BR);
  dome.castShadow = false; dome.receiveShadow = false;
  const ribs = new T.LineSegments(new T.EdgesGeometry(new T.SphereGeometry(7.24, 12, 5, 0, PI * 2, 0, PI / 2)), new T.LineBasicMaterial({ color: 0xeefbff, transparent: true, opacity: bridgeMode ? 0.2 : 0.42 }));
  ribs.position.y = 0.1; BR.add(ribs);
  mesh(new T.CylinderGeometry(0.1, 0.14, 3.2, 6), lam(FRAME), 0, 8.8, 0, BR);
  glow(0xff8f7a, 1.3, 0, 10.5, 0, BR, 0.9);
  const bpl = new T.PointLight(0xbff8ee, 0.45, 12); bpl.position.set(0, 3, 0); BR.add(bpl); bpl.layers.enable(1);

  // ---------- B. 통신 허브 ----------
  const MB = module({ x: 30.5, z: 7.5, axis: 'x', len: 11, R: 3.4 });
  const bY = MB.deckY;
  bx(8.0, 2.3, 0.08, basic(0x1d2c55), 30.5, bY + 1.45, 4.95);
  [bY + 2.6, bY + 0.3].forEach(y => bx(8.0, 0.08, 0.08, basic(TEAL), 30.5, y, 5.0));
  [26.5, 34.5].forEach(x => bx(0.08, 2.3, 0.08, basic(TEAL), x, bY + 1.45, 5.0));
  bx(7.6, 0.1, 0.6, lam(0xf1e9da), 30.5, bY + 0.45, 5.35);
  put('sphere', 0.7, 27.4, 5.35, bY + 0.5);
  put('sphere', 0.6, 29.6, 5.35, bY + 0.5);
  put('octa', 0.7, 31.6, 5.35, bY + 0.5);
  put('pad', 0.75, 33.6, 5.35, bY + 0.5);
  consoleAt(30.5, 9.3, PI, bY);
  strut(Wp(37.8, YC, 7.5), Wp(39.2, YC + 4.6, 7.5), 0.12);
  const dish = mesh(new T.SphereGeometry(1.5, 12, 5, 0, PI * 2, 0, 1.0), lam(0xf3ecdd, { side: T.DoubleSide }), 39.4, YC + 5.6, 7.5);
  dish.rotation.set(PI + 0.9, 0.7, 0);
  const tip = glow(0xff9d4d, 1.6, 39.4, YC + 5.4, 7.5, null, 0.9);
  anim.push(t => { tip.material.opacity = Math.sin(t * 3.4) > -0.3 ? 0.9 : 0.15; });

  // ---------- C. 화물 도킹 베이 ----------
  const MC = module({ x: 9.5, z: 33, axis: 'z', len: 14, R: 4.2 });
  const cY = MC.deckY;
  rack(7.0, 29.4, cY);
  rack(7.0, 33.9, cY);
  put('cube', 1.1, 10.6, 28.6, cY);
  put('cube', 1.1, 11.8, 31.6, cY);
  const issue9 = put('cube', 1.15, 10.9, 36.4, cY);
  issue9.rotation.y = 0.3;
  const dockRing = new T.TorusGeometry(2.4, 0.45, 8, 24);
  mesh(dockRing, lam(0xfff4e2), 9.5, YC, 41.8);
  mesh(new T.CylinderGeometry(2.0, 2.0, 0.3, 24), lam(0x2a2f63), 9.5, YC, 41.8).rotation.x = PI / 2;
  const dk2 = new T.TorusGeometry(1.5, 0.12, 4, 24); mesh(dk2, basic(TRIM), 9.5, YC, 42.0);

  // ---------- D. 승무원 작업 포드 (허브 + 캡슐 4개) ----------
  mesh(new T.IcosahedronGeometry(2.9, 1), lam(SKIN), 28, YC, 30);
  const hb = new T.TorusGeometry(3.0, 0.22, 6, 28); hb.rotateX(PI / 2);
  mesh(hb, bandMat, 28, YC, 30);
  [0, 1, 2, 3].forEach(i => { const a = i * PI / 2 + PI / 4; glow(LAMP, 0.9, 28 + Math.cos(a) * 2.95, YC + 0.9, 30 + Math.sin(a) * 2.95, null, 0.9); });
  const podDefs = [
    { id: 'K', col: 0x5fc4b8, hex: '#5fc4b8', m: { x: 28, z: 23.8, axis: 'z' }, con: [28, 21.7, 0], cr: [27.3, 24.8], cb: [29.2, 23.4] },
    { id: 'L', col: 0xf29a52, hex: '#f29a52', m: { x: 34.2, z: 30, axis: 'x' }, con: [36.3, 30, -PI / 2], cr: [33.4, 30.7], cb: [34.8, 28.8] },
    { id: 'P', col: 0xb39ae6, hex: '#b39ae6', m: { x: 21.8, z: 30, axis: 'x' }, con: [19.7, 30, PI / 2], cr: [22.6, 30.7], cb: [21.4, 28.8] },
    { id: 'C', col: 0xf2a7b8, hex: '#f2a7b8', m: { x: 28, z: 36.2, axis: 'z' }, con: [28, 38.3, PI], cr: [28.7, 35.3], cb: [26.8, 36.7] }
  ];
  const CREW = {};
  let podCube = {};
  podDefs.forEach(p => {
    const md = module({ x: p.m.x, z: p.m.z, axis: p.m.axis, len: 6, R: 2.5, cut: 160 });
    const y = md.deckY;
    consoleAt(p.con[0], p.con[1], p.con[2], y);
    podCube[p.id] = { x: p.cb[0], z: p.cb[1], y: y, g: put('cube', 0.95, p.cb[0], p.cb[1], y) };
    if (!bridgeMode) {
      const g = crew(p.col, p.cr[0], p.cr[1], PI / 4, 1.3, y);
      CREW[p.id] = { g: g, x: p.cr[0], z: p.cr[1], y: y };
    }
  });

  // ---------- G. 아카이브 화물칸 (장갑 금고) ----------
  const MG = module({ x: 47, z: 4.5, axis: 'z', len: 9, R: 3.6, armor: true, cut: 140 });
  rack(45.0, 2.5, MG.deckY);
  rack(45.0, 6.6, MG.deckY);
  put('cube', 1.1, 48.4, 4.6, MG.deckY).rotation.y = -0.2;

  // ---------- F. 발사 대기 거치대 ----------
  const fY = 2.0;
  bx(7.0, 0.3, 4.0, lam(FRAME), 47, fY, 17.6);
  bx(7.2, 0.25, 0.25, lam(METAL), 47, fY + 0.35, 15.7);
  bx(7.2, 0.25, 0.25, lam(METAL), 47, fY + 0.35, 19.5);
  bx(5.0, 0.02, 0.18, basic(TRIM), 47, fY + 0.17, 16.4);
  bx(5.0, 0.02, 0.18, basic(TRIM), 47, fY + 0.17, 18.8);
  [[45.6, 16.6, 0.5], [45.6, 18.6, -0.5], [48.4, 16.6, 0.5], [48.4, 18.6, -0.5]].forEach(c => {
    const arm = bx(0.3, 1.3, 0.3, lam(TRIM), c[0], fY + 0.75, c[1]); arm.rotation.x = c[2];
  });
  const arrow = new T.ConeGeometry(0.55, 1.1, 3); arrow.rotateZ(-PI / 2); arrow.scale(1, 0.25, 1);
  mesh(arrow, basic(TRIM), 50.0, fY + 0.2, 17.6);
  const lr = new T.TorusGeometry(2.2, 0.3, 6, 24); lr.rotateY(PI / 2);
  mesh(lr, lam(0xf3ecdd), 51.2, fY + 1.4, 17.6);
  const lr2 = new T.TorusGeometry(1.9, 0.06, 4, 24); lr2.rotateY(PI / 2);
  mesh(lr2, basic(TEAL), 51.25, fY + 1.4, 17.6);
  const rdy = new T.RingGeometry(1.3, 1.45, 30); rdy.rotateX(-PI / 2);
  mesh(rdy, basic(TEAL), 47, fY + 0.17, 17.6);
  put('prism', 1.3, 47, 17.6, fY + 0.15);
  thruster(47, fY - 0.6, 17.6, null, 0.9);

  // ---------- E. 스캐너 터널 (투명 튜브) ----------
  const EZ = 29, EX = 48, ER = 2.6;
  const tgeo = new T.CylinderGeometry(ER, ER, 16, 28, 1, true); tgeo.rotateZ(PI / 2);
  const glass = mesh(tgeo, lam(0xcff3f7, { transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false }), EX, YC, EZ);
  glass.castShadow = false;
  for (let x = -7.5; x <= 7.6; x += 2.5) { const rg = new T.TorusGeometry(ER + 0.04, 0.12, 5, 24); rg.rotateY(PI / 2); mesh(rg, bandMat, EX + x, YC, EZ); }
  [-8, 8].forEach(x => { const rg = new T.TorusGeometry(ER + 0.1, 0.4, 6, 24); rg.rotateY(PI / 2); mesh(rg, lam(0xe2d8c5), EX + x, YC, EZ); });
  const eY = YC - ER * 0.62;
  bx(16, 0.16, 3.8, lam(FLOOR), EX, eY - 0.12, EZ);
  bx(15.4, 0.2, 1.3, lam(0xcfc0a5), EX, eY + 0.05, EZ);
  const dashes = [];
  for (let i = 0; i < 9; i++) dashes.push(bx(0.8, 0.02, 0.14, basic(TEAL), 41 + i * 1.7, eY + 0.16, EZ));
  anim.push(t => { dashes.forEach((d, i) => { d.position.x = 40.8 + ((i * 1.7 + t * 1.2) % 15.3); }); });
  [42.8, 48.3, 53.6].forEach(x => {
    const ag = new T.TorusGeometry(2.0, 0.24, 6, 20); ag.rotateY(PI / 2);
    mesh(ag, lam(0xf3ecdd), x, YC, EZ);
    glow(TEAL, 1.3, x, YC + 2.0, EZ, null, 0.9);
  });
  const beamG = new T.CircleGeometry(1.9, 24); beamG.rotateY(PI / 2);
  const beam = mesh(beamG, basic(TEAL, { transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }), 48.3, YC, EZ);
  anim.push(t => { beam.material.opacity = 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4)); });
  const ekeel = bx(12, 0.5, 0.9, lam(METAL), EX, YC - ER - 0.2, EZ);
  ekeel.castShadow = true;
  [-4, 4].forEach(x => thruster(EX + x, YC - ER - 0.6, EZ, null, 0.8));
  const pr21 = put('prism', 1.25, 44.0, EZ, eY + 0.15);
  const pr23 = put('prism', 1.25, 51.5, EZ, eY + 0.15);

  // ---------- 연결 통로 ----------
  tube('x', 18.4, 25.0, 7.5);
  tube('z', 18.8, 24.6, 9.5);
  tube('x', 13.6, 17.6, 30);
  tube('z', 10.8, 19.8, 28);
  tube('x', 38.2, 40.2, 29.5);
  tube('z', 20.0, 26.6, 47);
  tube('z', 10.4, 15.6, 47);

  // ---------- 주 트러스, 태양광 날개, 방열판 ----------
  const trussFrom = { st: station.children.length, sc: scene.children.length };
  const TZ = 20, TY = 8.6;
  [[TY + 0.7, TZ - 0.6], [TY + 0.7, TZ + 0.6], [TY - 0.6, TZ]].forEach(c => bx(52, 0.2, 0.2, lam(FRAME), 29, c[0], c[1]));
  for (let x = 4; x < 54; x += 2) {
    strut(Wp(x, TY - 0.6, TZ), Wp(x + 2, TY + 0.7, TZ - 0.6), 0.06, lam(0xcabda5));
    strut(Wp(x, TY - 0.6, TZ), Wp(x + 2, TY + 0.7, TZ + 0.6), 0.06, lam(0xcabda5));
  }
  strut(Wp(28, TY - 0.6, TZ), Wp(28, YC + 2.4, 21.6), 0.14);
  strut(Wp(47, TY - 0.6, TZ), Wp(47, fY + 0.2, 19.4), 0.14);
  strut(Wp(9.5, TY - 0.6, TZ), Wp(9.5, YC + 4.1, 26.5), 0.14);
  strut(Wp(30.5, TY - 0.6, TZ), Wp(30.5, YC + 3.3, 9.5), 0.14);
  [-4.5, 62.5].forEach((x, i) => {
    const x0 = i ? 54 : 4;
    bx(Math.abs(x - x0) + 1, 0.2, 0.2, lam(FRAME), (x + x0) / 2, TY, TZ);
    panel(x, TY, TZ - 3.2, 12, 4.6);
    panel(x, TY, TZ + 3.2, 12, 4.6);
    bx(0.3, 0.3, 11.5, lam(FRAME), x, TY - 0.1, TZ);
  });
  [18, 23, 35, 40].forEach(x => {
    const f = bx(3.2, 0.06, 2.4, lam(0xf3ecdd), x, TY + 1.9, TZ); f.rotation.x = 0.0;
    bx(3.2, 0.06, 0.12, basic(TRIM), x, TY + 1.94, TZ + 1.15);
    strut(Wp(x, TY + 0.7, TZ), Wp(x, TY + 1.9, TZ), 0.06);
  });

  // 회의실 확대 시점에서는 트러스·패널이 카메라 앞을 가려서 숨김
  if (bridgeMode) {
    station.children.slice(trussFrom.st).forEach(o => { o.visible = false; });
    scene.children.slice(trussFrom.sc).forEach(o => { if (o.isMesh) o.visible = false; });
  }

  // ---------- 주변 드론 ----------
  [0, 1].forEach(i => {
    const d = new T.Group(); scene.add(d);
    const body = new T.Mesh(new T.CapsuleGeometry(0.35, 0.6, 3, 8), lam(0xf3ecdd)); body.rotation.z = PI / 2; d.add(body);
    const fin = new T.Mesh(new T.BoxGeometry(0.1, 0.5, 1.4), lam(0x2c4a7c)); d.add(fin);
    const lt2 = glow(i ? 0xff9d4d : TEAL, 1.2, 0.7, 0, 0, d, 0.9);
    anim.push(t => {
      const a = t * (i ? 0.12 : -0.09) + i * 2.4, r = i ? 44 : 38;
      d.position.set(Math.cos(a) * r, (i ? 12 : -6) + Math.sin(t * 0.8 + i) * 0.6, Math.sin(a) * r);
      d.rotation.y = -a + (i ? 0 : PI);
      lt2.material.opacity = Math.sin(t * 5 + i) > 0 ? 0.95 : 0.2;
    });
  });

  // ---------- 브리지 모드 승무원 ----------
  if (bridgeMode) {
    consoleAt(12 - 4.6, 12 - 4.6, PI / 4, 0.2);
    [
      { id: 'K', col: 0x5fc4b8, a: 70, name: 'dev-kim', hex: '#5fc4b8' },
      { id: 'L', col: 0xf29a52, a: 20, name: 'dev-lee', hex: '#f29a52' },
      { id: 'C', col: 0xf2a7b8, a: 200, name: 'dev-choi', hex: '#f2a7b8' },
      { id: 'P', col: 0xb39ae6, a: 250, name: 'dev-park', hex: '#b39ae6' }
    ].forEach(s => {
      const ar = s.a * PI / 180, r = 5.6;
      const x = 12 + Math.cos(ar) * r, z = 12 + Math.sin(ar) * r;
      const g = crew(s.col, x, z, Math.atan2(12 - x, 12 - z), 1.35, 0.2);
      CREW[s.id] = { g: g, x: x, z: z, y: 0.2 };
      lab('avatar', Wp(x, 3.35, z), { text: s.id, color: s.hex, dx: 16, dy: -4 });
      lab('name', Wp(x, 0.2, z), { text: s.name, align: 'below', dy: 8 });
    });
  }

  // ---------- 뷰별 강조와 라벨 ----------
  const crewAvatar = (id, hex) => { const c = CREW[id]; if (c) lab('avatar', Wp(c.x, c.y + 3.1, c.z), { text: id, color: hex, dx: 16, dy: -4 }); };
  const prY = eY + 0.15;
  if (view === 'default') {
    lab('module', Wp(12, 11.4, 12), { text: '회의실', align: 'above' });
    lab('module', Wp(30.5, YC + 4.4, 7.5), { text: '공용 게시 공간', align: 'above' });
    lab('module', Wp(9.5, YC + 5.2, 33), { text: '백로그 선반', align: 'above' });
    lab('module', Wp(28, YC + 3.6, 30), { text: '개인 책상', align: 'above' });
    lab('module', Wp(48, YC + 3.4, EZ), { text: '검토 영역', align: 'above' });
    lab('module', Wp(51.2, fY + 3.8, 17.6), { text: '머지 준비 선반', align: 'above' });
    lab('module', Wp(47, YC + 4.4, 4.5), { text: '완료 선반', align: 'above' });
    lab('badge', Wp(10.9, cY + 1.45, 36.4), { b: 'warn' });
    lab('badge', Wp(21.4, podCube.P.y + 1.25, 28.8), { b: 'clock' });
    lab('badge', Wp(44.0, prY + 1.15, EZ), { b: 'talk' });
    lab('badge', Wp(51.5, prY + 1.15, EZ), { b: 'conflict' });
    lab('badge', Wp(33.6, bY + 0.85, 5.35), { b: 'check' });
    podDefs.forEach(p => crewAvatar(p.id, p.hex));
  } else if (view === 'blocked') {
    hl(issue9); hl(CREW.P.g); hl(pr23);
    ringAt(10.9, 36.4, 1.3, 0xffb36b, cY);
    ringAt(CREW.P.x, CREW.P.z, 1.1, 0xffb36b, CREW.P.y);
    ringAt(51.5, EZ, 1.4, 0xffb36b, prY);
    lab('badge', Wp(10.9, cY + 1.45, 36.4), { b: 'warn' });
    lab('badge', Wp(51.5, prY + 1.15, EZ), { b: 'conflict' });
    crewAvatar('P', '#b39ae6');
    lab('rescue', Wp(CREW.P.x, CREW.P.y + 3.8, CREW.P.z), { dy: -10 });
    lab('bubble', Wp(CREW.P.x, CREW.P.y + 3.8, CREW.P.z), { align: 'above', dy: -34, text: 'JPA 연관관계 매핑에서 막혔어요', sub: 'dev-park · 2일째 같은 지점' });
    lab('callout', Wp(10.9, cY + 0.6, 36.4), { align: 'left', dx: -26, text: '#9 회원가입 유효성 검사', sub: '담당자 없이 6일째 대기' });
    lab('callout', Wp(51.5, prY + 0.3, EZ), { align: 'right', dx: 26, dy: 20, text: 'PR #23 산책 기록 저장', sub: '리뷰 대기 3일 · 병합 충돌 있음' });
  } else if (view === 'scanner') {
    hl(pr21);
    ringAt(44.0, EZ, 1.4, 0x8ff0e0, prY);
    lab('badge', Wp(44.0, prY + 1.15, EZ), { b: 'talk' });
    lab('tag', Wp(44.0, prY + 2.2, EZ), { align: 'above', dy: -8, text: 'PR #21 · 선택됨', border: '1px solid #8ff0e0' });
    lab('leader', Wp(44.0, prY + 0.9, EZ), { to: [W - 376, 330] });
  } else if (bridgeMode) {
    const top = (id, h) => Wp(AG[id].x, 1.38 + h, AG[id].z);
    lab('tag', top('reopen', 0.6), { align: 'left', dx: -34, dy: -26, text: '#3 로그인 세션 만료 처리', sub: '↺ 완료 선반에서 다시 꺼냄 · 닫힌 이슈', subColor: '#ffcb9e', border: '1px solid rgba(255, 179, 107, 0.7)' });
    lab('tag', top('pr', 1.1), { align: 'above', dy: -16, text: 'PR #21 매칭 요청 API', sub: '해결 안 된 리뷰 스레드 2' });
    lab('badge', top('pr', 0.75), { b: 'talk', dx: 22 });
    lab('tag', top('help', 0.6), { align: 'right', dx: 34, dy: -14, text: 'JPA 연관관계 매핑 실패', sub: '도움 요청 · 코멘트 3' });
    lab('tag', top('learn', 0.9), { align: 'right', dx: 30, dy: 16, text: '배운 점 · @Transactional 자기 호출' });
    lab('tag', top('decide', 0), { align: 'below', dy: 18, text: '10/30 결정 후속 확인' });
    lab('badge', top('decide', 0.3), { b: 'check', dx: 24 });
    lab('tag', top('cand', 0.6), { align: 'left', dx: -34, dy: 26, text: '후보 · #9 회원가입 유효성 검사', sub: '앱이 찾음 · 6일째 담당자 없음', subColor: '#b9e9e1', border: '1px dashed rgba(143, 240, 224, 0.8)' });
  }

  // ---------- 라벨 투영 ----------
  const project = () => {
    const out = [];
    L.forEach((l, i) => {
      const v = l.p.clone().project(cam);
      if (v.z > 1 || v.z < -1) return;
      const x = Math.round((v.x + 1) / 2 * W + (l.dx || 0));
      const y = Math.round((1 - v.y) / 2 * H + (l.dy || 0));
      if (x < -300 || x > W + 300 || y < -200 || y > H + 200) return;
      const o = Object.assign({}, l, { key: i, x: x, y: y });
      delete o.p;
      if (l.kind === 'leader') {
        const dx = l.to[0] - x, dy = l.to[1] - y;
        o.len = Math.round(Math.sqrt(dx * dx + dy * dy));
        o.ang = Math.round(Math.atan2(dy, dx) * 1800 / PI) / 10;
        delete o.to;
      }
      out.push(o);
    });
    if (opts.onLabels) opts.onLabels(out);
  };

  // ---------- 깎아 온 아바타로 우주인 교체 (스페이·라코 glTF) ----------
  // 모델 기준: 키 1, 원점 = 발바닥, 정면 +Z, 동작 Idle / Sit / Cheer / SitCheer
  const AV = [];
  // stationAvatar.js의 replaceAstronaut()로 기존 우주인(기본 도형)을 스페이 아바타로 교체
  const avatarUrl = opts.avatarUrl || './models/spay_avatar.glb';
  {
    const pm = new T.PMREMGenerator(renderer);
    const envS = new T.Scene();
    const eg = new T.SphereGeometry(10, 32, 16);
    const ecol = [], ep = eg.attributes.position;
    const cTop = new T.Color(0xdfe6ff), cBot = new T.Color(0x6f5f9e);
    for (let i = 0; i < ep.count; i++) { const kk = (ep.getY(i) / 10 + 1) / 2; const c = new T.Color().lerpColors(cBot, cTop, kk); ecol.push(c.r, c.g, c.b); }
    eg.setAttribute('color', new T.Float32BufferAttribute(ecol, 3));
    envS.add(new T.Mesh(eg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const sb = new T.Mesh(new T.PlaneGeometry(6, 3), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }));
    sb.position.set(-4, 6, 5); sb.lookAt(0, 0, 0); envS.add(sb);
    scene.environment = pm.fromScene(envS, 0.04).texture;
    Object.keys(CREW).forEach(id => {
      const c = CREW[id];
      let hlOn = false;
      c.g.traverse(o => { if (o.layers.isEnabled(1)) hlOn = true; });
      replaceAstronaut(c.g, avatarUrl).then(av => {
        if (!ctx._renderer) { av.root.removeFromParent(); return; }
        // 이 씬은 sRGB 출력 변환 없이(레거시) 그리므로 텍스처를 Linear로 둬야 칠한 색 그대로 보임
        av.root.traverse(o => {
          if (!o.isMesh) return;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if (m.map && m.map.encoding !== T.LinearEncoding) { m.map.encoding = T.LinearEncoding; m.map.needsUpdate = true; }
            m.envMapIntensity = 0.7;
          });
        });
        if (hlOn) hl(av.root);
        AV.push(av);
      }).catch(e => { console.error('[avatar]', e); if (opts.onError) opts.onError(e); });
    });
  }
  const ray = new T.Raycaster();
  ctx._pick = (e) => {
    const r = cv.getBoundingClientRect();
    const nd = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(nd, cam);
    let best = null, bd = 1e9;
    AV.forEach(a => { const hit = ray.intersectObject(a.root, true)[0]; if (hit && hit.distance < bd) { bd = hit.distance; best = a; } });
    if (best) { best.cheer(); return; }
    if (opts.onSelect && ray.intersectObject(pr21, true).length) opts.onSelect('pr21');
  };

  // ---------- 렌더 루프 ----------
  const dimScene = new T.Scene();
  const dimCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  dimScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ color: 0x0a0f2e, transparent: true, opacity: dimAmt, depthTest: false })));
  const clock = new T.Clock();
  const tmp = new T.Vector3();
  scene.updateMatrixWorld(true);
  let first = true;
  let lastT = 0;
  const loop = () => {
    if (!ctx._renderer) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - lastT); lastT = t;
    AV.forEach(a => a.update(dt));
    const k = 0.16;
    const dAz = goal.az - ctl.az, dEl = goal.el - ctl.el, dD = goal.dist - ctl.dist;
    if (Math.abs(dAz) > 1e-4 || Math.abs(dEl) > 1e-4 || Math.abs(dD) > 1e-3) {
      ctl.az += dAz * k; ctl.el += dEl * k; ctl.dist += dD * k; dirty = true;
    }
    if (dirty) {
      applyCam();
      updLights();
      stars.position.copy(cam.position);
      stars2.position.copy(cam.position);
      project();
      dirty = false;
    }
    MODS.forEach(md => {
      const lp = md.g.worldToLocal(tmp.copy(cam.position));
      let b = Math.atan2(lp.y, lp.z);
      if (b < 0) b = lp.z >= 0 ? 0.6 : PI - 0.6;
      b = clamp(b, 0.6, PI - 0.6);
      md.beta = first ? b : md.beta + (b - md.beta) * 0.2;
      md.shell.rotation.x = -md.beta;
      const ax = lp.x / Math.max(1e-3, lp.length());
      md.caps.forEach(c => { c.m.visible = c.s * ax < 0.55; });
    });
    first = false;
    anim.forEach(f => f(t));
    renderer.clear();
    cam.layers.set(0);
    renderer.render(scene, cam);
    if (dimAmt > 0) {
      renderer.clearDepth();
      renderer.render(dimScene, dimCam);
      renderer.clearDepth();
      cam.layers.set(1);
      renderer.render(scene, cam);
    }
    ctx._raf = requestAnimationFrame(loop);
  };
  loop();
  return {
    resetView() { if (ctx._reset) ctx._reset(); },
    dispose() {
      cancelAnimationFrame(ctx._raf);
      if (ctx._unbind) ctx._unbind();
      if (ctx._renderer) { ctx._renderer.dispose(); ctx._renderer = null; }
    }
  };
}
