// Aurelia Bay — boot and the one loop: input every frame, the world in
// fixed 1/60 s steps, the renderer painting what is there. Screens:
// title, play, paused, busted, wasted, complete.
//
// ?seed=N fixes the city. ?shot=cover|chase|mission|neon (with &seed=7)
// stages that scene with the real rules and sets window.__shotReady.
import { BOAT, CAR, ECONOMY, MISSION_DEFS, PALETTE, PLACES, PLAYER, STEP, WANTED, WORLD } from './config.js';
import { mulberry32, pick, range } from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { driveCar, makeCar, nearestCar, separateCars, steerToward, stepTraffic } from './vehicles.js';
import { hurtPed, makePed, nearestPed, stepPeds } from './pedestrians.js';
import { addWanted, createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SAVE_KEY = 'aurelia-bay.save.v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const random = mulberry32(seed);
const world = createWorld(random);
const police = createPolice(world, random);
const missions = createMissions(random);
const audio = createAudio();

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas, world);
const hud = createHud();
const input = createInput(canvas);

const player = {
  x: -240, z: 24, angle: Math.PI, health: 1, armour: 0,
  ammo: PLAYER.pistolMag, mag: PLAYER.pistolMag, reloadTimer: 0,
  walkPhase: 0, moving: false, inCar: false, car: null, inBoat: false, boat: null,
};
const boat = { x: -312, z: 200, angle: Math.PI / 2, speed: 0 };

const game = {
  seed, screen: SCREEN_TITLE, elapsed: 0, clockMinutes: 17 * 60 + 20,
  cash: ECONOMY.startCash, wanted: 0, quietTimer: 0, busted: false, wasted: false,
  missionsDone: 0, faresDone: 0, prompt: '', radioName: 'WAVE 98 — Synthwave',
  camYawDelta: 0, autopilot: null, bannerHold: null, keepShotHud: null,
  player, boat, cars: [], peds: [], police, missions, world, boatRun: null,
  boatRunTarget: null, saveTimer: 0, pedTimer: 0, radioStation: 0,
};

let starterCar = null;
let veloceCar = null;

function spawnTraffic() {
  game.cars.length = 0;
  for (let i = 0; i < 16; i += 1) {
    const spot = world.randomRoadPoint();
    const roll = random();
    const kind = roll < 0.12 ? 'sport' : roll < 0.27 ? 'taxi' : 'normal';
    const color = kind === 'taxi' ? PALETTE.taxi : pick(random, PALETTE.car);
    const car = makeCar(spot.x, spot.z, range(random, 0, Math.PI * 2), kind, color);
    game.cars.push(car);
  }
  starterCar = makeCar(-240, 20, Math.PI, 'normal', 0x3a6fd8);
  starterCar.owned = true;
  game.cars.push(starterCar);
  veloceCar = makeCar(-72, 240, Math.PI, 'sport', 0xd84040);
  veloceCar.veloce = true;
  game.cars.push(veloceCar);
}

function spawnPeds(count) {
  for (let i = 0; i < count; i += 1) {
    const road = pick(random, WORLD.roads);
    const along = range(random, -280, 280);
    const side = random() < 0.5 ? -11 : 11;
    const ped = random() < 0.5
      ? makePed(road + side, along, random)
      : makePed(along, road + side, random);
    ped.shirt = pick(random, [0xd84040, 0x3a6fd8, 0xe8b13c, 0x3fae6a, 0xe8e4da, 0x8a5fd0, 0xf0b8c8]);
    game.peds.push(ped);
  }
}

function resetGame() {
  player.x = -240; player.z = 24; player.angle = Math.PI;
  player.health = 1; player.armour = 0; player.ammo = PLAYER.pistolMag;
  player.inCar = false; player.car = null; player.inBoat = false; player.boat = null;
  boat.x = -312; boat.z = 200; boat.angle = Math.PI / 2; boat.speed = 0;
  game.cash = ECONOMY.startCash;
  game.wanted = 0; game.quietTimer = 0; game.busted = false; game.wasted = false;
  game.missionsDone = 0; game.faresDone = 0;
  game.clockMinutes = 17 * 60 + 20;
  game.autopilot = null; game.bannerHold = null; game.keepShotHud = null;
  game.boatRun = null; game.boatRunTarget = null;
  police.clearAll();
  missions.startMission(0);
  game.peds.length = 0;
  spawnTraffic();
  spawnPeds(24);
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      mission: missions.state.index, cash: game.cash, fares: game.faresDone,
    }));
  } catch { /* storage can be off */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Route planning for the autopilot: Manhattan route along roads. ------
function routeWaypoints(fx, fz, tx, tz) {
  const roads = WORLD.roads;
  const nearestRoad = (v) => roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const tNode = { x: nearestRoad(tx), z: nearestRoad(tz) };
  const rx = nearestRoad(fx);
  const rz = nearestRoad(fz);
  const wps = [];
  if (Math.abs(fx - rx) <= WORLD.roadHalf + 2) {
    wps.push({ x: rx, z: tNode.z });
    wps.push({ x: tNode.x, z: tNode.z });
  } else if (Math.abs(fz - rz) <= WORLD.roadHalf + 2) {
    wps.push({ x: tNode.x, z: rz });
    wps.push({ x: tNode.x, z: tNode.z });
  } else {
    wps.push({ x: rx, z: rz });
    wps.push({ x: tNode.x, z: rz });
    wps.push({ x: tNode.x, z: tNode.z });
  }
  wps.push({ x: tx, z: tz });
  return wps;
}

function autopilotInput() {
  const ap = game.autopilot;
  if (!ap) return null;
  const focus = player.inCar && player.car ? player.car : player.inBoat ? boat : player;
  const wp = ap.wps[ap.wi];
  if (!wp) return { forward: false, back: false, left: false, right: false, sprint: false, handbrake: false, interact: false, punch: false, taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0 };
  const d = Math.hypot(wp.x - focus.x, wp.z - focus.z);
  if (d < 8) {
    ap.wi += 1;
    return autopilotInput();
  }
  if (player.inCar && player.car) {
    const drive = steerToward(player.car, wp.x, wp.z);
    return {
      forward: drive.throttle > 0, back: drive.throttle < 0,
      left: drive.steer < -0.15, right: drive.steer > 0.15,
      sprint: false, handbrake: false, interact: false, punch: false,
      taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0,
      _drive: drive,
    };
  }
  if (player.inBoat) {
    const dx = wp.x - boat.x;
    const dz = wp.z - boat.z;
    const want = Math.atan2(dx, dz);
    let diff = want - boat.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return {
      forward: true, back: false, left: diff < -0.1, right: diff > 0.1,
      sprint: false, handbrake: false, interact: false, punch: false,
      taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0,
    };
  }
  // On foot: turn toward the waypoint and walk.
  const dx = wp.x - player.x;
  const dz = wp.z - player.z;
  const want = Math.atan2(dx, dz);
  let diff = want - player.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  player.angle += Math.max(-0.12, Math.min(0.12, diff));
  return {
    forward: Math.abs(diff) < 0.6, back: false, left: false, right: false,
    sprint: false, handbrake: false, interact: false, punch: false,
    taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0,
  };
}

// --- Mission helpers ------------------------------------------------------
function spawnFare() {
  // A waving fare: reuse a nearby walker, or spawn one at the roadside.
  let best = null;
  let bestD = 130;
  for (const ped of game.peds) {
    if (ped.state !== 'walk') continue;
    const d = Math.hypot(ped.x - player.x, ped.z - player.z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (!best) {
    best = makePed(player.x + 12, player.z, random);
    best.shirt = 0xf2c230;
    game.peds.push(best);
  }
  best.state = 'fare';
  best.fare = { destX: 0, destZ: 0 };
  return best;
}

function randomFareDest() {
  const spot = world.randomRoadPoint();
  return { x: spot.x, z: spot.z };
}

const missionHelpers = {
  spawnFare,
  randomFareDest,
  veloceCar: () => veloceCar,
};

// --- One fixed step -------------------------------------------------------
function update(dt, inputState) {
  game.elapsed += dt;
  game.clockMinutes = (game.clockMinutes + dt * 0.9) % 1440;

  const inp = inputState;
  game.camYawDelta = (inp.mouseDX || 0) * 0.004;

  // --- Player on foot ----------------------------------------------------
  if (!player.inCar && !player.inBoat) {
    const speed = inp.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (inp.left) player.angle -= 2.6 * dt;
    if (inp.right) player.angle += 2.6 * dt;
    let mx = 0;
    let mz = 0;
    if (inp.forward) { mx += Math.sin(player.angle); mz += Math.cos(player.angle); }
    if (inp.back) { mx -= Math.sin(player.angle) * 0.6; mz -= Math.cos(player.angle) * 0.6; }
    player.moving = mx !== 0 || mz !== 0;
    if (player.moving) {
      const len = Math.hypot(mx, mz);
      const moved = world.moveCircle(player.x, player.z, (mx / len) * speed * dt, (mz / len) * speed * dt, PLAYER.radius, false);
      player.x = moved.x;
      player.z = moved.z;
      player.walkPhase += dt * speed * 1.6;
    }
    // Enter a car, or the boat at the marina.
    if (inp.interact) {
      const car = nearestCar(game.cars, player.x, player.z, 6);
      const boatD = Math.hypot(boat.x - player.x, boat.z - player.z);
      if (car) {
        player.inCar = true;
        player.car = car;
        audio.sfx('enter');
        if (!car.owned && !car.veloce) addWanted(game, 1);
        if (car.veloce) hud.toast('You stole the Veloce GT!');
      } else if (boatD < 7) {
        player.inBoat = true;
        player.boat = boat;
        audio.sfx('enter');
        if (!game.boatRun) {
          game.boatRun = 'toA';
          game.boatRunTarget = { x: PLACES.boatDropA.x, z: PLACES.boatDropA.z };
          missions.state.target = { x: PLACES.boatDropA.x, z: PLACES.boatDropA.z, label: 'Smuggler Buoy' };
          hud.toast('Boat run: deliver the crates to the buoy — $260.');
        }
      }
    }
    // Punch.
    if (inp.punch) {
      const ped = nearestPed(game.peds, player.x, player.z, PLAYER.punchRange);
      if (ped) {
        const result = hurtPed(ped, PLAYER.punchDamage, random);
        audio.sfx('punch');
        if (result === 'dead') {
          game.peds.splice(game.peds.indexOf(ped), 1);
          addWanted(game, 1);
          hud.toast('You killed a pedestrian. The cops noticed.');
        }
      }
    }
    // Shoot (hitscan pistol, auto-reload when empty).
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) player.ammo = player.mag;
    } else if (inp.shoot && player.ammo > 0) {
      player.ammo -= 1;
      audio.sfx('shoot');
      const rangeTo = PLAYER.pistolRange;
      let best = null;
      let bestD = rangeTo;
      for (const ped of game.peds) {
        const d = Math.hypot(ped.x - player.x, ped.z - player.z);
        const ang = Math.atan2(ped.x - player.x, ped.z - player.z);
        let diff = ang - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (d < bestD && Math.abs(diff) < 0.12) { bestD = d; best = ped; }
      }
      if (best) {
        const result = hurtPed(best, PLAYER.pistolDamage, random);
        if (result === 'dead') {
          game.peds.splice(game.peds.indexOf(best), 1);
          addWanted(game, 1);
        } else {
          addWanted(game, 1);
        }
      }
      if (player.ammo === 0) player.reloadTimer = 1.1;
    }
    // Taxi pickup on foot does nothing — you need a car.
  } else if (player.inCar && player.car) {
    const car = player.car;
    const drive = inp._drive || {
      throttle: inp.forward ? 1 : inp.back ? -1 : 0,
      steer: (inp.left ? -1 : 0) + (inp.right ? 1 : 0),
      brake: inp.handbrake,
    };
    const before = car.speed;
    driveCar(car, drive, dt, world);
    if (Math.abs(car.speed - before) > 9) audio.sfx('crash');
    if (inp.interact && Math.abs(car.speed) < 1.5) {
      // Step out on the right side of the car.
      player.inCar = false;
      player.car = null;
      player.x = car.x + Math.cos(car.angle) * 2.4;
      player.z = car.z - Math.sin(car.angle) * 2.4;
      player.angle = car.angle;
    }
    if (inp.taxi) {
      const fare = nearestPed(game.peds, car.x, car.z, 9);
      if (fare && fare.state === 'fare') {
        fare.state = 'riding';
        missions.state.fare = fare;
        missions.state.fareStart = { x: car.x, z: car.z };
        missions.state.fareDest = randomFareDest();
        missions.state.target = { x: missions.state.fareDest.x, z: missions.state.fareDest.z, label: 'Drop-off' };
        hud.toast('Fare aboard — take them to the marker.');
        audio.sfx('pickup');
      }
    }
    // Spray & Go: $100 clears the wanted level.
    if (Math.hypot(car.x - PLACES.spray.x, car.z - PLACES.spray.z) < 11 && game.wanted > 0 && game.cash >= WANTED.sprayCost) {
      game.cash -= WANTED.sprayCost;
      game.wanted = 0;
      game.quietTimer = 0;
      police.clearAll();
      audio.sfx('cash');
      hud.toast('Fresh paint — the cops lost you. -$100.');
    }
  } else if (player.inBoat) {
    const steer = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
    if (inp.forward) boat.speed += BOAT.accel * dt;
    else if (inp.back) boat.speed -= BOAT.accel * dt;
    else boat.speed -= boat.speed * 1.2 * dt;
    boat.speed = Math.max(-6, Math.min(BOAT.maxSpeed, boat.speed));
    boat.angle += steer * BOAT.steer * Math.min(1, Math.abs(boat.speed) / 8) * Math.sign(boat.speed || 1) * dt;
    const moved = world.moveCircle(boat.x, boat.z, Math.sin(boat.angle) * boat.speed * dt, Math.cos(boat.angle) * boat.speed * dt, BOAT.radius, true);
    boat.x = moved.x;
    boat.z = moved.z;
    if (inp.interact && Math.abs(boat.speed) < 1.5) {
      player.inBoat = false;
      player.boat = null;
      player.x = -288;
      player.z = 200;
      player.angle = Math.PI / 2;
    }
    // Boat run delivery.
    if (game.boatRunTarget && Math.hypot(boat.x - game.boatRunTarget.x, boat.z - game.boatRunTarget.z) < 12) {
      game.cash += ECONOMY.boatRunPay;
      addWanted(game, 1);
      audio.sfx('cash');
      hud.toast(`Boat run done — $${ECONOMY.boatRunPay}. The coast guard is watching now.`);
      if (game.boatRun === 'toA') {
        game.boatRun = 'toB';
        game.boatRunTarget = { x: PLACES.boatDropB.x, z: PLACES.boatDropB.z };
      } else {
        game.boatRun = 'toA';
        game.boatRunTarget = { x: PLACES.boatDropA.x, z: PLACES.boatDropA.z };
      }
      missions.state.target = { x: game.boatRunTarget.x, z: game.boatRunTarget.z, label: 'Next Buoy' };
    }
  }

  // One-shot flags are consumed once: the same input object is reused
  // for every fixed step inside one frame, so without this a single
  // keypress would enter AND exit a car (or fire twice) in one frame.
  inp.interact = false;
  inp.punch = false;
  inp.taxi = false;
  inp.radio = false;
  inp.mute = false;
  inp.shoot = false;

  // --- Traffic, peds, police ---------------------------------------------
  const others = game.cars;
  for (const car of others) {
    if (player.inCar && car === player.car) continue;
    if (police.copCars.includes(car)) continue;
    stepTraffic(car, dt, world, random, others);
  }
  separateCars(game.cars);
  stepPeds(game.peds, dt, world, random, null);
  const outcome = police.step(dt, game, player, game.cars);
  if (outcome === 'busted') {
    game.busted = true;
  }

  // --- Missions ------------------------------------------------------------
  const mResult = missions.step(dt, game, player, missionHelpers);
  if (mResult === 'complete') {
    audio.sfx('mission');
    hud.banner('MISSION COMPLETE', missions.state.message, 3.5);
    saveGame();
  } else if (mResult === 'failed') {
    audio.sfx('fail');
    hud.banner('MISSION FAILED', missions.state.message, 3.5);
  }
  // Free-roam taxi fare (outside mission 3).
  if (missions.state.index !== 2 && !missions.state.fare && game.screen === SCREEN_PLAY) {
    game.pedTimer += dt;
    if (game.pedTimer > 45) {
      game.pedTimer = 0;
      const fare = spawnFare();
      hud.toast('A fare is waving — drive close in a car and press T.');
      missions.state.fare = fare;
    }
  }
  // Free-roam fare delivery.
  if (missions.state.fare && missions.state.fare.state === 'riding' && missions.state.fareDest && missions.state.index !== 2) {
    const car = player.car;
    if (car && Math.hypot(car.x - missions.state.fareDest.x, car.z - missions.state.fareDest.z) < 10) {
      const dist = Math.hypot(missions.state.fareDest.x - missions.state.fareStart.x, missions.state.fareDest.z - missions.state.fareStart.z);
      const pay = ECONOMY.taxiBase + Math.round(ECONOMY.taxiPerMetre * dist);
      game.cash += pay;
      missions.state.fare.state = 'walk';
      missions.state.fare.fare = null;
      missions.state.fare = null;
      missions.state.fareDest = null;
      audio.sfx('cash');
      hud.toast(`Fare dropped — $${pay}.`);
    }
  }

  // --- Health, wanted outcomes, upkeep ------------------------------------
  if (game.wanted === 0 && player.health < 1) {
    player.health = Math.min(1, player.health + PLAYER.regenPerSec * dt);
  }
  if (player.health <= 0 && !game.wasted) {
    game.wasted = true;
  }
  if (game.busted) {
    game.busted = false;
    const fine = Math.min(game.cash, WANTED.bustedFine);
    game.cash -= fine;
    game.wanted = 0;
    police.clearAll();
    audio.sfx('busted');
    respawnAtHospital();
    hud.toast(`BUSTED — fined $${fine}.`);
    game.screen = SCREEN_OVER;
    showEndCard('BUSTED', `The Aurelia Bay PD caught you. Fine: $${fine}. Your crew bailed you out at St Mercy Hospital.`, 'Keep going');
  }
  if (game.wasted) {
    game.wasted = false;
    const fine = Math.min(game.cash, WANTED.wastedFine);
    game.cash -= fine;
    game.wanted = 0;
    police.clearAll();
    audio.sfx('fail');
    respawnAtHospital();
    game.screen = SCREEN_OVER;
    showEndCard('WASTED', `You flatlined on the streets of Aurelia Bay. Hospital bill: $${fine}.`, 'Keep going');
  }
  if (missions.state.index >= MISSION_DEFS.length && game.screen === SCREEN_PLAY && !game.storyShown) {
    game.storyShown = true;
    game.screen = SCREEN_OVER;
    showEndCard('THE BIG SCORE', 'All six missions done. The Veloce GT is yours, the city is yours. Free roam Aurelia Bay as long as you like.', 'Free roam');
  }

  // Keep the sidewalks full.
  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    saveGame();
  }
  if (game.peds.length < 22) spawnPeds(24 - game.peds.length);

  // Prompt line.
  const nearCar = !player.inCar && !player.inBoat ? nearestCar(game.cars, player.x, player.z, 6) : null;
  const nearBoat = !player.inCar && !player.inBoat && Math.hypot(boat.x - player.x, boat.z - player.z) < 7;
  if (nearCar) game.prompt = nearCar.veloce ? 'E — Steal the Veloce GT' : nearCar.owned ? 'E — Get in your car' : 'E — Steal the car';
  else if (nearBoat) game.prompt = 'E — Take the boat';
  else if (player.inCar) game.prompt = 'E — Get out  ·  T — Pick up fare';
  else if (player.inBoat) game.prompt = 'E — Dock the boat';
  else game.prompt = '';

  // Audio follows speed and wanted level.
  const speedNorm = player.inCar && player.car ? Math.abs(player.car.speed) / CAR.maxSpeed : player.inBoat ? Math.abs(boat.speed) / BOAT.maxSpeed : 0;
  audio.update(dt, speedNorm, game.wanted);
  if (inp.radio) {
    game.radioName = audio.nextStation();
    hud.toast(game.radioName);
  }
  if (inp.mute) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  }
}

function respawnAtHospital() {
  player.inCar = false;
  player.car = null;
  player.inBoat = false;
  player.boat = null;
  player.x = PLACES.hospital.x;
  player.z = PLACES.hospital.z + 12;
  player.angle = 0;
  player.health = 1;
  player.armour = 0;
  missions.startMission(missions.state.index);
  game.autopilot = null;
}

function showEndCard(title, copy, button) {
  hud.showOverlay(title, copy, button, '');
}

// --- Screens ---------------------------------------------------------------
function showTitle() {
  game.screen = SCREEN_TITLE;
  const save = loadSave();
  const copy = save && save.mission > 0
    ? `Welcome back to Aurelia Bay. You left off on mission ${save.mission + 1} with $${save.cash}. The sun is setting over the bay — the city is waiting.`
    : 'You are back in Aurelia Bay after five years away. Rico needs a driver, the cops need a target, and the whole sunset coast is yours to take. Six missions. One big score.';
  hud.showOverlay('AURELIA BAY', copy, save && save.mission > 0 ? 'Continue' : 'New game',
    '<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move / drive · <kbd>Shift</kbd> Sprint</li>' +
    '<li><kbd>Mouse drag</kbd> Camera · <kbd>Click</kbd> Shoot · <kbd>F</kbd> Punch</li>' +
    '<li><kbd>E</kbd> Enter / steal car · <kbd>T</kbd> Pick up fare · <kbd>R</kbd> Radio · <kbd>P</kbd> Pause</li>');
}

function startGame(fromSave) {
  resetGame();
  if (fromSave) {
    const save = loadSave();
    if (save) {
      game.cash = save.cash || ECONOMY.startCash;
      game.faresDone = save.fares || 0;
      missions.startMission(Math.min(save.mission || 0, MISSION_DEFS.length - 1));
    }
  }
  game.screen = SCREEN_PLAY;
  hud.hideOverlay();
  hud.banner(MISSION_DEFS[missions.state.index]?.title || 'Aurelia Bay', missions.state.objective, 4);
  audio.unlock();
}

hud.overlayBtn.addEventListener('click', () => {
  audio.unlock();
  if (game.screen === SCREEN_TITLE) {
    const save = loadSave();
    startGame(save && save.mission > 0);
  } else if (game.screen === SCREEN_OVER) {
    game.screen = SCREEN_PLAY;
    hud.hideOverlay();
  } else if (game.screen === SCREEN_PAUSED) {
    game.screen = SCREEN_PLAY;
    hud.hideOverlay();
  }
});

function runShot(name) {
  const api = {
    resetGame,
    setClock(minutes) { game.clockMinutes = minutes; },
    setCamYaw(yaw) { game.camYawSet = yaw; },
    startDriving(x, z, angle, kind) {
      resetGame();
      game.screen = SCREEN_PLAY;
      const car = makeCar(x, z, angle, kind || 'normal', kind === 'taxi' ? PALETTE.taxi : 0x3a6fd8);
      car.owned = true;
      game.cars.push(car);
      player.inCar = true;
      player.car = car;
      player.x = x;
      player.z = z;
      player.angle = angle;
    },
    startOnFoot(x, z, angle) {
      resetGame();
      game.screen = SCREEN_PLAY;
      player.x = x;
      player.z = z;
      player.angle = angle;
    },
    setWanted(stars) { game.wanted = stars; },
    spawnCopCars(count, minD, maxD) {
      for (let i = 0; i < count; i += 1) {
        const behind = player.inCar && player.car ? player.car : player;
        const d = range(random, minD, maxD);
        const angle = behind.angle + Math.PI + range(random, -0.4, 0.4);
        const car = makeCar(behind.x + Math.sin(angle) * d, behind.z + Math.cos(angle) * d, behind.angle, 'police', 0x1c2f4a);
        game.cars.push(car);
        police.copCars.push(car);
      }
    },
    spawnPedsNear(x, z, count) {
      for (let i = 0; i < count; i += 1) {
        const ped = makePed(x + range(random, -14, 14), z + range(random, -14, 14), random);
        ped.shirt = pick(random, [0xd84040, 0x3a6fd8, 0xe8b13c, 0x3fae6a]);
        game.peds.push(ped);
      }
    },
    setObjective(objective, tx, tz, label) {
      missions.state.objective = objective;
      missions.state.target = { x: tx, z: tz, label };
    },
    keepShotHud(title, sub) {
      game.bannerHold = { title, sub };
    },
    toast(message) { hud.toast(message, 999); },
    setFareAboard() {
      const fare = makePed(player.car.x + 2, player.car.z, random);
      fare.state = 'riding';
      fare.shirt = 0xf2c230;
      game.peds.push(fare);
      missions.state.fare = fare;
    },
    stepAutopilot(tx, tz) {
      if (!game.autopilot || game.autopilot.tx !== tx || game.autopilot.tz !== tz) {
        const focus = player.inCar && player.car ? player.car : player;
        // Boats steer straight at the target across open water; cars
        // follow the road grid.
        const wps = player.inBoat ? [{ x: tx, z: tz }] : routeWaypoints(focus.x, focus.z, tx, tz);
        game.autopilot = { tx, tz, wps, wi: 0 };
      }
      const inp = autopilotInput() || { forward: false, back: false, left: false, right: false, sprint: false, handbrake: false, interact: false, punch: false, taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0 };
      update(STEP, inp);
    },
    stepIdle() {
      update(STEP, { forward: false, back: false, left: false, right: false, sprint: false, handbrake: false, interact: false, punch: false, taxi: false, radio: false, pause: false, shoot: false, mouseDX: 0, mouseDY: 0 });
    },
  };
  game.screen = SCREEN_PLAY;
  hud.hideOverlay();
  stageShot(name, game, api);
  // Paint many frames so the follow camera lerps from its spawn point
  // onto the car, then signal readiness.
  let painted = 0;
  function paint() {
    renderer.draw(game, 1 / 60);
    hud.update(game, 1 / 60);
    painted += 1;
    if (painted < 60) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  resetGame();
  showTitle();
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const inp = input.read();
    if (inp.pause) {
      if (game.screen === SCREEN_PLAY) {
        game.screen = SCREEN_PAUSED;
        hud.showOverlay('PAUSED', 'Aurelia Bay waits. The sun keeps setting without you.', 'Resume', '');
      } else if (game.screen === SCREEN_PAUSED) {
        game.screen = SCREEN_PLAY;
        hud.hideOverlay();
      }
    }
    if (game.screen === SCREEN_PLAY) {
      accumulator += dtReal;
      while (accumulator >= STEP) {
        // Live autopilot (used by the play-test driver, off by default).
        const live = game.autopilot ? autopilotInput() : null;
        update(STEP, live || inp);
        accumulator -= STEP;
        if (game.screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
    }
    if (game.screen !== SCREEN_TITLE) {
      renderer.draw(game, dtReal);
      hud.update(game, dtReal);
    } else {
      // Title backdrop: slow orbit over the city at golden hour.
      game.clockMinutes = 17 * 60 + 28;
      game.camYawDelta = dtReal * 0.05;
      renderer.draw(game, dtReal);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      hud.showOverlay('PAUSED', 'Aurelia Bay waits. The sun keeps setting without you.', 'Resume', '');
    }
  });
  requestAnimationFrame(frame);
}

// Debug state for the play-test driver (and the shot tooling).
window.__aurelia = {
  game,
  state() {
    return {
      screen: game.screen,
      cash: Math.floor(game.cash),
      wanted: game.wanted,
      mission: missions.state.index + 1,
      missionTitle: MISSION_DEFS[missions.state.index]?.title || 'Complete',
      objective: missions.state.objective,
      timer: missions.state.timer,
      clock: hud.fmtClock(game.clockMinutes),
      health: player.health,
      ammo: player.ammo,
      player: (() => {
        const focus = player.inCar && player.car ? player.car : player.inBoat ? boat : player;
        return { x: Math.round(focus.x), z: Math.round(focus.z), angle: +player.angle.toFixed(2), inCar: player.inCar, inBoat: player.inBoat };
      })(),
      cars: game.cars.length,
      copCars: police.copCars.length,
      footCops: police.footCops.length,
      peds: game.peds.length,
    };
  },
  start() { startGame(false); },
  enterCar() { input.press('KeyE'); },
  autopilotTo(x, z) {
    const focus = player.inCar && player.car ? player.car : player;
    // Boats steer straight at the target across open water; cars follow
    // the road grid.
    const wps = player.inBoat ? [{ x, z }] : routeWaypoints(focus.x, focus.z, x, z);
    game.autopilot = { tx: x, tz: z, wps, wi: 0 };
  },
  clearAutopilot() { game.autopilot = null; },
  press(code) { input.press(code); },
  setClock(minutes) { game.clockMinutes = minutes; },
  setWanted(stars) { game.wanted = stars; },
};

if (shot) runShot(shot);
else runGame();
