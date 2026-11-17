// Aurelia Bay — pedestrians: walkers, fleeing, and taxi fares.
// One job: the people on the sidewalks — wander, flee from gunfire, and
// wave for taxis. Peds never enter buildings or the sea.

import { range } from './random.js';

export function makePed(x, z, random) {
  return {
    x, z, angle: range(random, 0, Math.PI * 2),
    speed: range(random, 1.2, 2.2),
    walkPhase: range(random, 0, Math.PI * 2),
    color: 0,
    shirt: 0,
    state: 'walk', // walk | flee | wait | fare | riding
    targetX: x, targetZ: z,
    wait: range(random, 0, 6),
    health: 1,
    fare: null, // { destX, destZ, label } when this ped is a waving fare
  };
}

export function stepPeds(peds, dt, world, random, danger) {
  for (const ped of peds) {
    if (ped.state === 'riding') continue;
    if (ped.state === 'fare') {
      // A waving fare stands still (and keeps waving) until a taxi comes.
      ped.walkPhase += dt * 6;
      continue;
    }
    if (ped.state === 'flee' && ped.wait > 0) {
      ped.wait -= dt;
      if (ped.wait <= 0) ped.state = 'walk';
    }
    if (danger && ped.state !== 'flee') {
      const d = Math.hypot(danger.x - ped.x, danger.z - ped.z);
      if (d < 26) {
        ped.state = 'flee';
        ped.wait = 3 + random() * 2;
        const away = Math.atan2(ped.x - danger.x, ped.z - danger.z);
        ped.targetX = ped.x + Math.sin(away) * 40;
        ped.targetZ = ped.z + Math.cos(away) * 40;
      }
    }
    if (ped.state === 'walk' || ped.state === 'flee') {
      if (ped.wait > 0) {
        ped.wait -= dt;
      } else {
        const dx = ped.targetX - ped.x;
        const dz = ped.targetZ - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 2) {
          // Pick a new nearby sidewalk point to wander to.
          ped.targetX = Math.max(-290, Math.min(290, ped.x + range(random, -50, 50)));
          ped.targetZ = Math.max(-290, Math.min(290, ped.z + range(random, -50, 50)));
          ped.wait = range(random, 0, 4);
        } else {
          ped.angle = Math.atan2(dx, dz);
          const speed = ped.state === 'flee' ? ped.speed * 2.6 : ped.speed;
          const moved = world.moveCircle(ped.x, ped.z, Math.sin(ped.angle) * speed * dt, Math.cos(ped.angle) * speed * dt, 0.6, false);
          ped.x = moved.x;
          ped.z = moved.z;
          ped.walkPhase += dt * speed * 2.4;
        }
      }
    }
  }
}

// A ped that just got punched or shot: falls, then flees.
export function hurtPed(ped, damage, random) {
  ped.health -= damage;
  if (ped.health <= 0) return 'dead';
  ped.state = 'flee';
  ped.wait = 4 + random() * 2;
  return 'hurt';
}

export function nearestPed(peds, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const ped of peds) {
    if (ped.state === 'riding') continue;
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
