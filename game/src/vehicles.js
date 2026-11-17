// Aurelia Bay — cars: arcade physics, traffic AI, carjacking.
// One job: every car in the city (player's, traffic, police, taxi) moves
// through these functions. Cars slide along walls, never wedge.

import { CAR } from './config.js';
import { pick, range } from './random.js';

export function makeCar(x, z, angle, kind, color) {
  return {
    x, z, angle, speed: 0, kind, color,
    maxSpeed: kind === 'sport' ? CAR.sportMax : kind === 'police' ? CAR.policeMax : kind === 'taxi' ? CAR.maxSpeed * 0.95 : CAR.maxSpeed,
    targetNode: null, wait: 0, honk: 0, brakeLight: false,
  };
}

// Arcade drive: speed along the nose, velocity lerps to it. `drive` is
// { throttle: -1..1, steer: -1..1, brake: bool }. Returns distance moved.
export function driveCar(car, drive, dt, world) {
  const maxFwd = car.maxSpeed;
  const maxRev = CAR.reverseMax;
  if (drive.brake) {
    car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  } else if (drive.throttle > 0) {
    car.speed += CAR.accel * drive.throttle * dt;
    if (car.speed > maxFwd) car.speed = maxFwd;
  } else if (drive.throttle < 0) {
    car.speed += CAR.accel * drive.throttle * dt;
    if (car.speed < -maxRev) car.speed = -maxRev;
  } else {
    car.speed -= car.speed * 1.6 * dt;
    if (Math.abs(car.speed) < 0.1) car.speed = 0;
  }
  const steerScale = Math.min(1, Math.abs(car.speed) / 8);
  car.angle += drive.steer * CAR.steer * steerScale * Math.sign(car.speed || 1) * dt;
  const dx = Math.sin(car.angle) * car.speed * dt;
  const dz = Math.cos(car.angle) * car.speed * dt;
  // Move x then z, each validated at the car's front and back points, so
  // cars slide along walls instead of wedging on building corners. A
  // blocked axis keeps the car's old position on that axis and scrubs
  // speed instead of teleporting it.
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  const half = CAR.length / 2;
  const endsBlocked = (x, z) => world.blocked(x + fx * half, z + fz * half, CAR.radius * 0.6, false)
    || world.blocked(x - fx * half, z - fz * half, CAR.radius * 0.6, false);
  const movedX = world.moveCircle(car.x, car.z, dx, 0, CAR.radius, false);
  if (endsBlocked(movedX.x, movedX.z)) {
    car.speed *= 0.4;
  } else {
    car.x = movedX.x;
    car.z = movedX.z;
  }
  const movedZ = world.moveCircle(car.x, car.z, 0, dz, CAR.radius, false);
  if (endsBlocked(movedZ.x, movedZ.z)) {
    car.speed *= 0.4;
  } else {
    car.x = movedZ.x;
    car.z = movedZ.z;
  }
  car.brakeLight = drive.brake || drive.throttle < 0;
  return Math.abs(car.speed) * dt;
}

// Steer a car toward a point: returns { throttle, steer } for driveCar.
export function steerToward(car, tx, tz, speedCap) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 1;
  if (dist < 12) throttle = 0.35;
  if (Math.abs(diff) > 1.2) throttle = 0.25; // slow for sharp turns
  if (speedCap !== undefined && Math.abs(car.speed) > speedCap) throttle = 0;
  return { throttle, steer, brake: false, dist };
}

// Traffic: follow the road graph, slow for the car ahead.
export function stepTraffic(car, dt, world, random, allCars) {
  if (!car.targetNode || Math.hypot(car.targetNode.x - car.x, car.targetNode.z - car.z) < 10) {
    const node = world.nearestNode(car.x, car.z);
    const neighbours = world.nodeNeighbours(node);
    car.targetNode = neighbours.length ? pick(random, neighbours) : node;
  }
  let cap = car.maxSpeed * 0.55;
  for (let i = 0; i < allCars.length; i += 1) {
    const other = allCars[i];
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 14 && d > 0.01) {
      const ahead = (dx * Math.sin(car.angle) + dz * Math.cos(car.angle)) / d;
      if (ahead > 0.6) { cap = Math.min(cap, Math.max(0, other.speed)); }
    }
  }
  const drive = steerToward(car, car.targetNode.x, car.targetNode.z, cap);
  driveCar(car, drive, dt, world);
}

// Positional separation only — never trade speeds, or a ramming cop glues
// itself to the player car.
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = CAR.radius * 2 + 0.4;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
