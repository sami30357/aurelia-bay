// Aurelia Bay — Three.js rendering only: the scene, the camera, the
// golden-hour light. The game state comes in, pixels go out; no rules
// live here. Static city meshes are built once; cars, peds and the
// player are pooled groups whose transforms are updated each frame.

import * as THREE from 'three';
import { PALETTE, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const DAY = { sun: 0xfff2c8, hemi: 1.0, bg: PALETTE.skyDay, fog: 0xa8c8dc };
const DUSK = { sun: 0xff7a2a, hemi: 0.8, bg: PALETTE.skyDusk, fog: PALETTE.fogDusk };
const NIGHT = { sun: 0x8fa8ff, hemi: 0.35, bg: PALETTE.skyNight, fog: 0x0e1626 };

function lerpColor(a, b, t, out) {
  out.setHex(a);
  out.lerp(new THREE.Color(b), t);
  return out;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDusk);
  // Denser fog so distant empty planes melt into the sunset instead of
  // dominating the frame.
  scene.fog = new THREE.Fog(PALETTE.fogDusk, 120, 460);

  // Gradient sky dome (canvas textures, no external assets): a flat
  // background colour reads as a painted wall behind a sparse city.
  function skyTexture(top, mid, horizon) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const skyTextures = {
    day: skyTexture('#5ea8dd', '#a8d0e8', '#ffe3b0'),
    dusk: skyTexture('#4a2a6e', '#ff7a3c', '#ffd27a'),
    night: skyTexture('#04081a', '#0e1a33', '#24365e'),
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(850, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTextures.dusk, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(skyDome);

  // Facade textures: a lit-window grid so buildings read as city, not
  // flat coloured slabs. One canvas for the lit look (map) and one for
  // the night glow (emissiveMap); window layout matches between them.
  function facadeTextures() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const e = document.createElement('canvas');
    e.width = 128; e.height = 128;
    const g = c.getContext('2d');
    const ge = e.getContext('2d');
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 128, 128);
    ge.fillStyle = '#000000'; ge.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = 8 + col * 30;
        const y = 8 + row * 20;
        const lit = ((row * 4 + col) % 3) === 0;
        g.fillStyle = lit ? '#ffd27a' : '#33404f';
        g.fillRect(x, y, 20, 12);
        if (lit) { ge.fillStyle = '#ffca6a'; ge.fillRect(x, y, 20, 12); }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    const etex = new THREE.CanvasTexture(e);
    for (const t of [tex, etex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    }
    return { tex, etex };
  }
  const facade = facadeTextures();

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  camera.position.set(0, 30, 40);

  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x3a4a5a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(sun.target);

  // Sun disc in the sky, low over the sea at golden hour.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  scene.add(sunDisc);
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(12, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8eefc, fog: false }),
  );
  scene.add(moonDisc);

  // Sun glow: a soft radial halo so the low sun blooms instead of
  // sitting as a flat disc on a flat sky.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128; glowCanvas.height = 128;
  const gg = glowCanvas.getContext('2d');
  const radial = gg.createRadialGradient(64, 64, 4, 64, 64, 64);
  radial.addColorStop(0, 'rgba(255, 214, 130, 0.95)');
  radial.addColorStop(0.4, 'rgba(255, 150, 70, 0.45)');
  radial.addColorStop(1, 'rgba(255, 120, 50, 0)');
  gg.fillStyle = radial;
  gg.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const sunGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(sunGlow);

  const matCache = new Map();
  function mat(color, opts) {
    const key = `${color}|${opts ? JSON.stringify(opts) : ''}`;
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
    }
    return matCache.get(key);
  }

  function box(w, h, d, color, x, y, z, opts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // --- Static city -------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), mat(PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, 620), mat(PALETTE.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-272, 0.05, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 640), mat(PALETTE.sea));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-460, 0.1, 0);
  scene.add(sea);

  for (const r of WORLD.roads) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, 620), mat(PALETTE.road));
    v.rotation.x = -Math.PI / 2;
    v.position.set(r, 0.08, 0);
    v.receiveShadow = true;
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(620, WORLD.roadHalf * 2), mat(PALETTE.road));
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.08, r);
    h.receiveShadow = true;
    scene.add(h);
    // Centre line so the avenues read as roads, not black voids.
    const lv = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 620), mat(PALETTE.roadLine));
    lv.rotation.x = -Math.PI / 2;
    lv.position.set(r, 0.12, 0);
    scene.add(lv);
    const lh = new THREE.Mesh(new THREE.PlaneGeometry(620, 0.5), mat(PALETTE.roadLine));
    lh.rotation.x = -Math.PI / 2;
    lh.position.set(0, 0.12, r);
    scene.add(lh);
  }

  // Block slabs: each city block gets a slightly different muted tone
  // (pavement, lawn, bare earth) so the ground between buildings stops
  // reading as one flat green plane.
  const slabTones = PALETTE.pavement;
  for (let i = 0; i < WORLD.roads.length - 1; i += 1) {
    for (let j = 0; j < WORLD.roads.length - 1; j += 1) {
      const x0 = WORLD.roads[i] + WORLD.roadHalf;
      const x1 = WORLD.roads[i + 1] - WORLD.roadHalf;
      const z0 = WORLD.roads[j] + WORLD.roadHalf;
      const z1 = WORLD.roads[j + 1] - WORLD.roadHalf;
      if (x1 <= x0 || z1 <= z0) continue;
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(x1 - x0, z1 - z0),
        mat(slabTones[(i * 7 + j * 13) % slabTones.length]),
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }
  // Boardwalk promenade along the beach edge.
  const boardwalk = new THREE.Mesh(new THREE.PlaneGeometry(18, 620), mat(PALETTE.boardwalk));
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(-247, 0.04, 0);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  const neonMeshes = [];
  const lampBulbs = [];
  const buildingMats = [];
  for (const b of world.buildings) {
    // Window-textured facade: UVs repeat the window grid by building size.
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const uv = geo.attributes.uv;
    const ru = Math.max(1, Math.round(b.w / 9));
    const rv = Math.max(1, Math.round(b.h / 9));
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    const bmat = new THREE.MeshLambertMaterial({
      color: b.color, map: facade.tex, emissiveMap: facade.etex,
      emissive: 0xffb347, emissiveIntensity: 0.15,
    });
    buildingMats.push(bmat);
    const mesh = new THREE.Mesh(geo, bmat);
    mesh.position.set(b.x + b.w / 2, b.h / 2, b.z + b.d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Roof cap.
    box(b.w * 0.7, 1.2, b.d * 0.7, 0x6a6a72, b.x + b.w / 2, b.h + 0.6, b.z + b.d / 2);
    if (b.neon) {
      // Neon on ALL FOUR faces: a sign on the z-faces alone is edge-on
      // and invisible from the avenue running alongside the building.
      const signY = Math.min(b.h - 3.5, 11);
      const stripY = Math.min(b.h - 1, 8);
      for (const zFace of [b.z - 0.2, b.z + b.d + 0.2]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(b.w * 0.9, 1.1, 0.3),
          new THREE.MeshBasicMaterial({ color: b.neon }),
        );
        strip.position.set(b.x + b.w / 2, stripY, zFace);
        scene.add(strip);
        neonMeshes.push(strip);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 6.0, 0.4),
          new THREE.MeshBasicMaterial({ color: b.neon }),
        );
        sign.position.set(b.x + b.w / 2, signY, zFace < b.z + b.d / 2 ? zFace - 0.1 : zFace + 0.1);
        scene.add(sign);
        neonMeshes.push(sign);
      }
      for (const xFace of [b.x - 0.2, b.x + b.w + 0.2]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 1.1, b.d * 0.9),
          new THREE.MeshBasicMaterial({ color: b.neon }),
        );
        strip.position.set(xFace, stripY, b.z + b.d / 2);
        scene.add(strip);
        neonMeshes.push(strip);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 6.0, 2.0),
          new THREE.MeshBasicMaterial({ color: b.neon }),
        );
        sign.position.set(xFace < b.x + b.w / 2 ? xFace - 0.1 : xFace + 0.1, signY, b.z + b.d / 2);
        scene.add(sign);
        neonMeshes.push(sign);
      }
    }
  }
  for (const c of world.containers) {
    box(c.w, c.h, c.d, c.color, c.x, c.h / 2, c.z);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
  const leafGeo = new THREE.ConeGeometry(1.5, 2.1, 6);
  for (const p of world.palms) {
    const trunk = new THREE.Mesh(trunkGeo, mat(0x8a6a42));
    trunk.scale.y = p.h;
    trunk.position.set(p.x, p.h / 2, p.z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, mat(0x3f9e4d));
    leaves.position.set(p.x, p.h + 1.4, p.z);
    scene.add(leaves);
  }
  for (const lamp of world.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 5), mat(0x333a44));
    pole.position.set(lamp.x, 3, lamp.z);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    bulb.position.set(lamp.x, 6.1, lamp.z);
    scene.add(bulb);
    lampBulbs.push(bulb);
  }

  // Parked cars along the curbs (static, simplified: body + cabin +
  // dark chassis so they read as cars from the follow camera).
  for (const pc of world.parked || []) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 4.4), mat(pc.color));
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.0), mat(0x1a2433));
    cabin.position.set(0, 1.35, -0.2);
    group.add(cabin);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.3, 4.45), mat(0x14161a));
    chassis.position.y = 0.3;
    group.add(chassis);
    group.position.set(pc.x, 0, pc.z);
    group.rotation.y = pc.angle;
    scene.add(group);
  }

  // Beach umbrellas: pole + bright cone on the sand.
  for (const u of world.umbrellas || []) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), mat(0xe8e4da));
    pole.position.set(u.x, 1.2, u.z);
    scene.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.3, 8), mat(u.color));
    canopy.position.set(u.x, 2.9, u.z);
    canopy.castShadow = true;
    scene.add(canopy);
  }

  // Beach towels: flat bright rectangles on the sand for colour + scale.
  for (const t of world.towels || []) {
    const towel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.4), mat(t.color));
    towel.position.set(t.x, 0.1, t.z);
    towel.rotation.y = t.angle;
    towel.receiveShadow = true;
    scene.add(towel);
  }

  // --- Pooled dynamic objects -------------------------------------------
  const carGroups = new Map();
  const pedGroups = new Map();
  const copGroups = new Map();
  let playerGroup = null;
  let boatGroup = null;

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = mat(0x14161a);

  function buildCarGroup(car) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.85, CAR_L), mat(car.color));
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR_W * 0.82, 0.7, CAR_L * 0.45), mat(0x1a2433));
    cabin.position.set(0, 1.35, -0.2);
    cabin.castShadow = true;
    group.add(cabin);
    const wheelPositions = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
    for (const [wx, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      group.add(wheel);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const hx of [-0.6, 0.6]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.15), headMat);
      head.position.set(hx, 0.7, CAR_L / 2 + 0.05);
      group.add(head);
    }
    const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881111 });
    for (const bx of [-0.6, 0.6]) {
      const brake = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.15), brakeMat);
      brake.position.set(bx, 0.7, -CAR_L / 2 - 0.05);
      group.add(brake);
    }
    group.userData.brakeMat = brakeMat;
    if (car.kind === 'police') {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      barR.position.set(-0.45, 1.85, -0.2);
      group.add(barR);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      barB.position.set(0.45, 1.85, -0.2);
      group.add(barB);
      group.userData.barR = barR;
      group.userData.barB = barB;
    }
    if (car.kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xf2c230 }));
      sign.position.set(0, 1.85, -0.2);
      group.add(sign);
    }
    scene.add(group);
    return group;
  }
  const CAR_W = 2.0;
  const CAR_L = 4.4;

  function buildPersonGroup(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.1, 8), mat(color));
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0xe8b88a));
    head.position.y = 1.95;
    head.castShadow = true;
    group.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), mat(0x2a2f38));
    legL.position.set(-0.2, 0.35, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.2;
    group.add(legR);
    group.userData.legL = legL;
    group.userData.legR = legR;
    scene.add(group);
    return group;
  }

  function buildBoat() {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 6.5), mat(0xe8e4da));
    hull.position.y = 0.5;
    hull.castShadow = true;
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.2), mat(0x1a2433));
    cabin.position.set(0, 1.2, -0.6);
    group.add(cabin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.25, 6.55), new THREE.MeshBasicMaterial({ color: 0xd84040 }));
    stripe.position.y = 0.85;
    group.add(stripe);
    scene.add(group);
    return group;
  }

  // Mission marker: glowing beacon + floating diamond.
  const marker = new THREE.Group();
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 13;
  marker.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), new THREE.MeshBasicMaterial({ color: 0xffd23c }));
  diamond.position.y = 9;
  marker.add(diamond);
  marker.visible = false;
  scene.add(marker);

  let camYaw = 0;
  let camPitch = 0.42;
  let camDist = 13;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // The one frame function. `g` is the whole game state from main.js.
  function draw(g, dt) {
    const clock = g.clockMinutes;
    const hour = clock / 60;
    // Golden-hour curve: day 7-17, dusk 17-19, night otherwise.
    let phase; // 0 day, 1 dusk, 2 night
    let t = 0;
    if (hour >= 7 && hour < 16.5) { phase = 0; t = 0; }
    else if (hour >= 16.5 && hour < 19) { phase = 1; t = (hour - 16.5) / 2.5; }
    else if (hour >= 19 || hour < 5) { phase = 2; t = 0; }
    else { phase = 1; t = 1 - (hour - 5) / 2; } // dawn, dusk-ish
    const tmp = new THREE.Color();
    if (phase === 0) {
      scene.background.copy(lerpColor(DAY.bg, DUSK.bg, 0, tmp));
      scene.fog.color.copy(lerpColor(DAY.fog, DUSK.fog, 0, tmp));
      sun.color.setHex(DAY.sun);
      hemi.intensity = DAY.hemi;
      sun.intensity = 1.9;
      skyDome.material.map = skyTextures.day;
      for (const m of buildingMats) m.emissiveIntensity = 0.12;
    } else if (phase === 1) {
      scene.background.copy(lerpColor(DAY.bg, DUSK.bg, t, tmp));
      scene.fog.color.copy(lerpColor(DAY.fog, DUSK.fog, t, tmp));
      sun.color.setHex(t < 0.5 ? DAY.sun : DUSK.sun);
      hemi.intensity = DAY.hemi + (DUSK.hemi - DAY.hemi) * t;
      // Warmer, stronger golden-hour sun.
      sun.intensity = 1.9 - 0.6 * t;
      skyDome.material.map = skyTextures.dusk;
      for (const m of buildingMats) m.emissiveIntensity = 0.15 + 0.45 * t;
    } else {
      scene.background.setHex(NIGHT.bg);
      scene.fog.color.setHex(NIGHT.fog);
      sun.color.setHex(NIGHT.sun);
      hemi.intensity = NIGHT.hemi;
      sun.intensity = 0.5;
      skyDome.material.map = skyTextures.night;
      for (const m of buildingMats) m.emissiveIntensity = 1.0;
    }
    // Sun path: rises east, sets west over the sea. At 17:30 it is low.
    const sunAngle = ((hour - 6) / 12) * Math.PI; // 6:00 east horizon -> 18:00 west
    const sunX = Math.cos(sunAngle) * 420;
    const sunY = Math.max(18, Math.sin(sunAngle) * 260);
    sun.position.set(sunX, sunY + 60, -120);
    sun.target.position.set(g.player.x, 0, g.player.z);
    sunDisc.position.set(sunX, sunY, -380);
    sunDisc.lookAt(camera.position);
    sunDisc.visible = phase !== 2;
    sunGlow.position.set(sunX, sunY, -375);
    sunGlow.lookAt(camera.position);
    sunGlow.visible = phase !== 2;
    skyDome.position.set(camera.position.x, 0, camera.position.z);
    moonDisc.position.set(300, 220, -380);
    moonDisc.lookAt(camera.position);
    moonDisc.visible = phase === 2;
    const neonOn = phase !== 0;
    for (const n of lampBulbs) {
      if (n.material && n.material.color) n.material.color.setHex(neonOn ? 0xffe9a8 : 0x8a7a5a);
    }
    sea.position.y = 0.1 + Math.sin(g.elapsed * 0.5) * 0.05;

    // --- Player ----------------------------------------------------------
    const p = g.player;
    if (!playerGroup) playerGroup = buildPersonGroup(0x3a6fd8);
    if (p.inCar || p.inBoat) {
      playerGroup.visible = false;
    } else {
      playerGroup.visible = true;
      playerGroup.position.set(p.x, 0, p.z);
      playerGroup.rotation.y = p.angle;
      const swing = Math.sin(p.walkPhase) * 0.5 * (p.moving ? 1 : 0);
      playerGroup.userData.legL.rotation.x = swing;
      playerGroup.userData.legR.rotation.x = -swing;
    }

    // --- Cars ------------------------------------------------------------
    const seenCars = new Set();
    for (const car of g.cars) {
      seenCars.add(car);
      let group = carGroups.get(car);
      if (!group) {
        group = buildCarGroup(car);
        carGroups.set(car, group);
      }
      group.visible = true;
      group.position.set(car.x, 0, car.z);
      group.rotation.y = car.angle;
      group.userData.brakeMat.color.setHex(car.brakeLight ? 0xff2222 : 0x881111);
      if (group.userData.barR) {
        const blink = Math.floor(g.elapsed * 4) % 2 === 0;
        group.userData.barR.material.color.setHex(blink ? 0xff2222 : 0x441111);
        group.userData.barB.material.color.setHex(blink ? 0x111144 : 0x2244ff);
      }
    }
    for (const [car, group] of carGroups) {
      if (!seenCars.has(car)) group.visible = false;
    }

    // --- Peds + foot cops -------------------------------------------------
    const seenPeds = new Set();
    for (const ped of g.peds) {
      seenPeds.add(ped);
      let group = pedGroups.get(ped);
      if (!group) {
        group = buildPersonGroup(ped.shirt || 0xd84040);
        pedGroups.set(ped, group);
      }
      group.visible = ped.state !== 'riding';
      group.position.set(ped.x, 0, ped.z);
      group.rotation.y = ped.angle;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      group.userData.legL.rotation.x = swing;
      group.userData.legR.rotation.x = -swing;
    }
    for (const [ped, group] of pedGroups) {
      if (!seenPeds.has(ped)) group.visible = false;
    }
    const seenCops = new Set();
    for (const cop of g.police.footCops) {
      seenCops.add(cop);
      let group = copGroups.get(cop);
      if (!group) {
        group = buildPersonGroup(0x1c2f4a);
        copGroups.set(cop, group);
      }
      group.visible = true;
      group.position.set(cop.x, 0, cop.z);
      group.rotation.y = cop.angle;
    }
    for (const [cop, group] of copGroups) {
      if (!seenCops.has(cop)) group.visible = false;
    }

    // --- Boat -------------------------------------------------------------
    if (!boatGroup) boatGroup = buildBoat();
    boatGroup.visible = true;
    boatGroup.position.set(g.boat.x, 0.1 + Math.sin(g.elapsed * 1.2) * 0.12, g.boat.z);
    boatGroup.rotation.y = g.boat.angle;

    // --- Marker -----------------------------------------------------------
    const target = g.missions.state.target;
    if (target && g.screen === SCREEN_PLAY) {
      marker.visible = true;
      marker.position.set(target.x, 0, target.z);
      diamond.position.y = 9 + Math.sin(g.elapsed * 2) * 0.8;
      diamond.rotation.y += dt * 1.5;
      const col = g.missions.state.fareDest ? 0x2fd6c2 : 0xffd23c;
      beacon.material.color.setHex(col);
      diamond.material.color.setHex(col);
    } else {
      marker.visible = false;
    }

    // --- Camera -----------------------------------------------------------
    if (typeof g.camYawSet === 'number') camYaw = g.camYawSet;
    const focus = p.inCar && p.car ? p.car : p.inBoat && p.boat ? p.boat : p;
    const focusAngle = focus.angle;
    camYaw += (g.camYawDelta || 0);
    const desiredYaw = focusAngle + Math.PI + camYaw;
    // Pulled a little further back and lower than before so the street,
    // the buildings and the skyline all sit in frame instead of a
    // close-up of the road surface.
    const dist = p.inCar ? 14 : p.inBoat ? 15 : 11;
    camDist += (dist - camDist) * 0.08;
    const cx = focus.x + Math.sin(desiredYaw) * camDist;
    const cz = focus.z + Math.cos(desiredYaw) * camDist;
    const cy = 5 + camDist * 0.22;
    camera.position.x += (cx - camera.position.x) * 0.12;
    camera.position.y += (cy - camera.position.y) * 0.12;
    camera.position.z += (cz - camera.position.z) * 0.12;
    camera.lookAt(focus.x, 3.2, focus.z);
    g.camYawDelta = 0;

    renderer.render(scene, camera);
  }

  return { draw, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER };
}
