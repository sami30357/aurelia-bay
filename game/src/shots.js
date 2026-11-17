// Aurelia Bay — staged screenshot scenes behind ?shot=<name>&seed=7.
// One job: set up each of the four shots, then drive the real rules
// forward with an autopilot (steer toward a point, slow for sharp
// turns) — never teleport the hero car onto a marker. The HUD banner
// and marker are held through keepShotHud, not by starting a mission.

import { PLACES } from './config.js';

// Steer a car (or the player on foot) toward a point, using the same
// steering the traffic AI uses. Returns { throttle, steer }.
export function autopilotDrive(car, tx, tz) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 1;
  if (dist < 14) throttle = 0.35;
  if (Math.abs(diff) > 1.2) throttle = 0.25;
  return { throttle, steer, brake: false, dist };
}

// `game` is the live game object from main.js; `api` exposes the small
// set of setters main.js provides for staging (start, setClock, spawn
// cops, setWanted, setObjective, keepShotHud).
export function stageShot(name, game, api) {
  api.resetGame();
  const g = game;
  if (name === 'cover') {
    api.startDriving(-240, 40, Math.PI); // coastal avenue, facing north
    api.setClock(18 * 60 + 5); // golden hour, sun low over the sea
    api.setCamYaw(0.7); // swing the camera so the sea and sun sit in frame
    api.setObjective("Drive to Rico's Bar", PLACES.ricoBar.x, PLACES.ricoBar.z, "Rico's Bar");
    api.keepShotHud("MISSION 1 — WELCOME HOME", "Drive to Rico's Bar");
    // Drive the real car down the avenue toward the bar for 7 seconds.
    for (let i = 0; i < 7 * 60; i += 1) {
      api.stepAutopilot(PLACES.ricoBar.x, PLACES.ricoBar.z);
    }
    return 'play';
  }
  if (name === 'chase') {
    api.startDriving(80, -120, 0); // facing south, toward the run
    api.setClock(18 * 60 + 45); // dusk
    api.setWanted(3);
    // Camera swung off the tail line: with yaw 0 the cruisers sat
    // directly behind the hero and either hid it (spawned close) or sat
    // behind the camera (spawned far). Swung 0.4, a cruiser at 14–18
    // back reads at the frame edge beside the hero car.
    api.setCamYaw(0.4);
    api.spawnCopCars(2, 14, 18);
    api.setObjective('Lose the cops — Spray & Go clears your wanted level', PLACES.spray.x, PLACES.spray.z, 'Spray & Go');
    api.keepShotHud('HEAT CHECK', 'Stay free — the whole city is coming!');
    api.toast('The whole city is coming!');
    for (let i = 0; i < 5 * 60; i += 1) {
      api.stepAutopilot(80, 240);
    }
    return 'play';
  }
  if (name === 'mission') {
    api.startOnFoot(-264, 172, Math.PI); // on the sand, facing north up the beach
    api.setClock(16 * 60 + 40); // late afternoon on the beach
    api.setCamYaw(-0.5); // swing the camera toward the road, the palms and the marker
    api.setObjective('Pick up the crate at Coral Beach', PLACES.beachPickup.x, PLACES.beachPickup.z, 'Coral Beach');
    api.keepShotHud('MISSION 5 — COAST RUN', 'Pick up the crate at Coral Beach');
    api.spawnPedsNear(-262, 168, 6);
    for (let i = 0; i < 2 * 60; i += 1) api.stepIdle();
    return 'play';
  }
  if (name === 'neon') {
    // Start north of Downtown and drive into the Golden Mile (z < -200),
    // where the neon buildings are — starting at the taxi stand left the
    // taxi in dark Downtown for the whole shot.
    api.startDriving(0, -20, Math.PI, 'taxi'); // facing north, into the Golden Mile
    api.setClock(21 * 60 + 30); // night on the Golden Mile
    api.setWanted(1);
    // Same off-tail camera trick as the chase: the cruiser reads at the
    // frame edge instead of hiding the taxi or sitting behind the camera.
    api.setCamYaw(0.4);
    api.spawnCopCars(1, 14, 18);
    api.setFareAboard();
    api.setObjective('Drop the fare at Club Mirage', PLACES.club.x, PLACES.club.z, 'Club Mirage');
    api.keepShotHud('NIGHT SHIFT', 'Fare aboard — drop them at Club Mirage');
    for (let i = 0; i < 6 * 60; i += 1) {
      api.stepAutopilot(0, -240);
    }
    return 'play';
  }
  // Unknown name: fall back to the cover.
  return stageShot('cover', game, api);
}
