// Aurelia Bay — the city: road graph, buildings, palms, port and beach.
// One job: generate the fixed city from a seed and answer collision and
// navigation questions. No drawing and no game rules live here.

import { PALETTE, PLACES, WORLD } from './config.js';
import { intRange, pick, range } from './random.js';

export function createWorld(random) {
  const buildings = [];
  const palms = [];
  const containers = [];
  const lamps = [];
  const parked = [];
  const umbrellas = [];

  // One building per block cell, placed off the roads. Blocks are the gaps
  // between neighbouring road lines; a block is skipped on the beach strip
  // and the port strip, which get palms and containers instead.
  const roads = WORLD.roads;
  for (let i = 0; i < roads.length - 1; i += 1) {
    for (let j = 0; j < roads.length - 1; j += 1) {
      const x0 = roads[i] + WORLD.roadHalf + 4;
      const x1 = roads[i + 1] - WORLD.roadHalf - 4;
      const z0 = roads[j] + WORLD.roadHalf + 4;
      const z1 = roads[j + 1] - WORLD.roadHalf - 4;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (cx < -235) continue; // beach strip: no buildings
      if (cx > 250) continue; // port strip: containers instead
      const downtown = Math.abs(cx) < 90 && Math.abs(cz) < 90;
      const tall = downtown ? range(random, 26, 58) : range(random, 8, 26);
      const w = Math.min(x1 - x0, range(random, 26, 44));
      const d = Math.min(z1 - z0, range(random, 26, 44));
      // Golden Mile is the northernmost block row (cz == -200): it must
      // be neon, or the night shot has no neon at all. (cz < -200 never
      // fired — no block centre sits north of -200.)
      const neon = cz <= -200 || (cx > 100 && cz > 100); // Golden Mile + Downtown glow
      buildings.push({
        x: cx - w / 2, z: cz - d / 2, w, d, h: tall,
        color: pick(random, PALETTE.building),
        neon: neon ? pick(random, PALETTE.neon) : 0,
        roof: random(),
      });
      // A second, smaller building in wide blocks.
      if (random() < 0.45 && x1 - x0 > 52) {
        const w2 = range(random, 14, 22);
        const d2 = range(random, 14, 22);
        buildings.push({
          x: x0 + range(random, 0, Math.max(0, x1 - x0 - w2)), z: z0 + range(random, 0, Math.max(0, z1 - z0 - d2)),
          w: w2, d: d2, h: range(random, 6, 14),
          color: pick(random, PALETTE.building), neon: 0, roof: random(),
        });
      }
    }
  }

  // Palms along the beach and scattered on sidewalks — dense, so the
  // coastal avenue and the beach read as lined, not bare.
  for (let z = -280; z <= 280; z += 16) {
    palms.push({ x: -244 + range(random, -4, 4), z: z + range(random, -5, 5), h: range(random, 7, 11) });
  }
  for (let i = 0; i < 44; i += 1) {
    palms.push({ x: pick(random, roads) + (random() < 0.5 ? -11 : 11), z: range(random, -280, 280), h: range(random, 6, 10) });
  }
  // Second beach palm row, closer to the water and clear of the beach
  // player start, so no trunk fills the mission-shot foreground.
  for (let z = -272; z <= 272; z += 34) {
    palms.push({ x: -278 + range(random, -3, 3), z: z + range(random, -7, 7), h: range(random, 6, 9) });
  }

  // Beach towels near the umbrellas so the sand has colour and scale.
  const towels = [];
  for (let i = 0; i < 16; i += 1) {
    towels.push({
      x: range(random, -292, -254), z: range(random, -272, 272),
      color: pick(random, [0xff4d6d, 0x2fd6c2, 0xffb347, 0x7c5cff, 0xf2e6c8]),
      angle: range(random, 0, Math.PI),
    });
  }

  // Beach umbrellas on the sand so Coral Beach reads as a beach, not a
  // flat tan plane.
  for (let i = 0; i < 18; i += 1) {
    umbrellas.push({
      x: range(random, -292, -256), z: range(random, -272, 272),
      color: pick(random, [0xff4d6d, 0x2fd6c2, 0xffb347, 0x7c5cff, 0xf2e6c8, 0xff7a3c]),
    });
  }

  // Parked cars along the curbs: one per road segment, parked parallel
  // 9.5 off the centre line so the road itself stays clear for traffic,
  // the autopilot and the starter car. Kept clear of mission targets and
  // intersections. Axis-aligned footprint (hw/hd) is stored for collision.
  const nearPlace = (x, z, d) => Object.values(PLACES).some((p) => Math.hypot(p.x - x, p.z - z) < d);
  for (const r of roads) {
    for (let j = 0; j < roads.length - 1; j += 1) {
      const a = roads[j] + 20;
      const b = roads[j + 1] - 20;
      if (b <= a) continue;
      // Vertical road (x = r): car noses along z.
      if (random() < 0.62) {
        const z = range(random, a, b);
        const x = r + (random() < 0.5 ? -9.5 : 9.5);
        if (!nearPlace(x, z, 16)) {
          parked.push({ x, z, angle: random() < 0.5 ? 0 : Math.PI, hw: 1.3, hd: 2.6, color: pick(random, PALETTE.car) });
        }
      }
      // Horizontal road (z = r): car noses along x.
      if (random() < 0.62) {
        const x = range(random, a, b);
        const z = r + (random() < 0.5 ? -9.5 : 9.5);
        if (!nearPlace(x, z, 16)) {
          parked.push({ x, z, angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, hw: 2.6, hd: 1.3, color: pick(random, PALETTE.car) });
        }
      }
    }
  }

  // Port Aurelia: stacked container rows on the east edge.
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (random() < 0.2) continue;
      containers.push({
        x: 258 + row * 11, z: -240 + col * 62 + range(random, -6, 6),
        w: 9, d: 26, h: intRange(random, 1, 2) * 3.2,
        color: pick(random, [0xc8552e, 0x2e7f9e, 0xe8b13c, 0x3fae6a, 0x8a5fd0]),
      });
    }
  }

  // Street lamps at every intersection, for the night look, plus
  // mid-block lamps so the avenues read as lit streets at night.
  for (const rx of roads) {
    for (const rz of roads) lamps.push({ x: rx + 9, z: rz + 9 });
  }
  for (let j = 0; j < roads.length - 1; j += 1) {
    const mid = (roads[j] + roads[j + 1]) / 2;
    for (const r of roads) {
      lamps.push({ x: r + 9, z: mid });
      lamps.push({ x: mid, z: r + 9 });
    }
  }

  function onRoad(x, z) {
    const near = (v) => roads.some((r) => Math.abs(v - r) <= WORLD.roadHalf + 2);
    return near(x) || near(z);
  }

  // Is the point (x, z) inside a solid thing? `inWater` lets boats pass.
  function blocked(x, z, radius, inWater) {
    if (inWater) {
      if (x > -282) return true; // the shoreline
      if (x < -420 || z < -300 || z > 300) return true;
      return false;
    }
    if (x < -296 || x > 296 || z < -296 || z > 296) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + radius > b.x && x - radius < b.x + b.w && z + radius > b.z && z - radius < b.z + b.d) return true;
    }
    for (let i = 0; i < containers.length; i += 1) {
      const c = containers[i];
      if (x + radius > c.x - c.w / 2 && x - radius < c.x + c.w / 2 && z + radius > c.z - c.d / 2 && z - radius < c.z + c.d / 2) return true;
    }
    for (let i = 0; i < parked.length; i += 1) {
      const p = parked[i];
      if (x + radius > p.x - p.hw && x - radius < p.x + p.hw && z + radius > p.z - p.hd && z - radius < p.z + p.hd) return true;
    }
    return false;
  }

  // Move a circle from (x, z) by (dx, dz), sliding along walls: try x, then z.
  function moveCircle(x, z, dx, dz, radius, inWater) {
    let nx = x;
    let nz = z;
    if (!blocked(x + dx, z, radius, inWater)) nx = x + dx;
    if (!blocked(nx, z + dz, radius, inWater)) nz = z + dz;
    return { x: nx, z: nz, hitX: nx !== x + dx, hitZ: nz !== z + dz };
  }

  function nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const rx of roads) {
      for (const rz of roads) {
        const d = (rx - x) * (rx - x) + (rz - z) * (rz - z);
        if (d < bestD) { bestD = d; best = { x: rx, z: rz }; }
      }
    }
    return best;
  }

  // Neighbour intersections of a road-graph node (up/down/left/right).
  function nodeNeighbours(node) {
    const out = [];
    for (const r of roads) {
      if (r !== node.x) out.push({ x: r, z: node.z });
      if (r !== node.z) out.push({ x: node.x, z: r });
    }
    // Keep only adjacent roads (one step away on the grid).
    return out.filter((n) => {
      const dx = Math.abs(n.x - node.x);
      const dz = Math.abs(n.z - node.z);
      const step = (a, b) => {
        const ia = roads.indexOf(a);
        const ib = roads.indexOf(b);
        return Math.abs(ia - ib) === 1;
      };
      return (dx > 0 && dz === 0 && step(n.x, node.x)) || (dz > 0 && dx === 0 && step(n.z, node.z));
    });
  }

  // A point on a road centre line, clear of buildings, for spawning cars.
  function randomRoadPoint() {
    const along = pick(random, roads);
    const across = pick(random, roads);
    if (random() < 0.5) return { x: along, z: across + range(random, -30, 30) };
    return { x: across + range(random, -30, 30), z: along };
  }

  return { buildings, palms, containers, lamps, parked, umbrellas, towels, onRoad, blocked, moveCircle, nearestNode, nodeNeighbours, randomRoadPoint };
}
