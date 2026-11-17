// Aurelia Bay — the wanted level and the police response.
// One job: stars, decay, cop cars that chase on the road graph, foot cops
// that hold the player, and the BUSTED / WASTED outcomes.

import { WANTED } from './config.js';
import { makeCar, steerToward, driveCar } from './vehicles.js';

export function createPolice(world, random) {
  const copCars = [];
  const footCops = [];
  let spawnTimer = 0;

  function wantedCopCars(wanted) {
    return Math.min(WANTED.maxCopCars, wanted + 1);
  }

  function spawnCopCarNear(playerX, playerZ) {
    const node = world.nearestNode(playerX, playerZ);
    const neighbours = world.nodeNeighbours(node);
    const spot = neighbours.length ? neighbours[Math.floor(random() * neighbours.length)] : node;
    const angle = Math.atan2(playerX - spot.x, playerZ - spot.z);
    const car = makeCar(spot.x, spot.z, angle, 'police', 0x1c2f4a);
    car.targetNode = node;
    copCars.push(car);
    return car;
  }

  function spawnFootCop(playerX, playerZ) {
    const angle = random() * Math.PI * 2;
    const cop = {
      x: playerX + Math.sin(angle) * 30, z: playerZ + Math.cos(angle) * 30,
      angle, speed: 7.5, hold: 0, state: 'chase',
    };
    const moved = world.moveCircle(cop.x, cop.z, 0, 0, 0.6, false);
    cop.x = moved.x;
    cop.z = moved.z;
    footCops.push(cop);
    return cop;
  }

  // Advance the police one step. `player` is the shared player object;
  // `onBusted` / `onWasted` are called once when the outcome lands.
  function step(dt, game, player, cars) {
    const wanted = game.wanted;
    spawnTimer -= dt;
    if (wanted > 0) {
      if (copCars.length < wantedCopCars(wanted) && spawnTimer <= 0) {
        spawnCopCarNear(player.x, player.z);
        spawnTimer = 2.5;
      }
      if (footCops.length < Math.min(WANTED.maxFootCops, wanted) && spawnTimer <= -1.5) {
        spawnFootCop(player.x, player.z);
        spawnTimer = 1;
      }
    }

    // Cop cars: follow the road graph toward the player's intersection
    // when far, tail the player when close — never ram through them.
    const px = player.inCar && player.car ? player.car.x : player.x;
    const pz = player.inCar && player.car ? player.car.z : player.z;
    const playerSpeed = player.inCar && player.car ? Math.abs(player.car.speed) : 0;
    for (let i = copCars.length - 1; i >= 0; i -= 1) {
      const cop = copCars[i];
      if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
      const d = Math.hypot(px - cop.x, pz - cop.z);
      let drive;
      if (d < 55) {
        // Tail: match the player's speed when close, so the cruiser
        // sits on the bumper instead of gluing itself to the car.
        const cap = d < 20 ? playerSpeed + 3 : cop.maxSpeed;
        drive = steerToward(cop, px, pz, cap);
      } else {
        const node = world.nearestNode(px, pz);
        if (!cop.targetNode || Math.hypot(cop.targetNode.x - cop.x, cop.targetNode.z - cop.z) < 12) {
          cop.targetNode = node;
        }
        drive = steerToward(cop, cop.targetNode.x, cop.targetNode.z);
      }
      driveCar(cop, drive, dt, world);
      // A hard bump hurts a little, at most once a second per cruiser.
      if (player.inCar && player.car && d < 5.5 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1;
        player.health = Math.max(0, player.health - 0.03);
      }
    }

    // Foot cops run at the on-foot player and hold them ~1.4 s -> BUSTED.
    for (let i = footCops.length - 1; i >= 0; i -= 1) {
      const cop = footCops[i];
      if (player.inCar || player.inBoat) {
        // Lose the foot cops when the player gets away in a vehicle.
        footCops.splice(i, 1);
        continue;
      }
      const d = Math.hypot(player.x - cop.x, player.z - cop.z);
      if (d < 2.2) {
        cop.hold += dt;
        if (cop.hold > 1.4) {
          game.busted = true;
          footCops.length = 0;
          return 'busted';
        }
      } else {
        cop.hold = 0;
        const angle = Math.atan2(player.x - cop.x, player.z - cop.z);
        cop.angle = angle;
        const moved = world.moveCircle(cop.x, cop.z, Math.sin(angle) * cop.speed * dt, Math.cos(angle) * cop.speed * dt, 0.6, false);
        cop.x = moved.x;
        cop.z = moved.z;
      }
    }

    // Wanted decay: one star per ~26 s with no crime and no cop close.
    if (wanted > 0) {
      let copNear = false;
      for (const cop of copCars) {
        if (Math.hypot(px - cop.x, pz - cop.z) < 60) { copNear = true; break; }
      }
      if (!copNear && footCops.length === 0) {
        game.quietTimer += dt;
        if (game.quietTimer >= WANTED.decaySeconds) {
          game.quietTimer = 0;
          game.wanted = Math.max(0, game.wanted - 1);
        }
      } else {
        game.quietTimer = 0;
      }
    }
    return null;
  }

  function clearAll() {
    copCars.length = 0;
    footCops.length = 0;
  }

  return { copCars, footCops, step, clearAll, spawnCopCarNear };
}

export function addWanted(game, stars) {
  game.wanted = Math.min(WANTED.maxStars, game.wanted + stars);
  game.quietTimer = 0;
}
