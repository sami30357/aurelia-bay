// Aurelia Bay — tuning, palette, districts and named places.
// One job: every number the rest of the game shares lives here.

export const STEP = 1 / 60;
export const WORLD = {
  half: 300, // land runs -300..300 on x and z; the sea is west of x = -300
  beachX: -252, // sand strip starts here, sea water west of -300
  roadHalf: 7, // half-width of a road
  roads: [-240, -160, -80, 0, 80, 160, 240], // avenue / street centre lines
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  radius: 0.9,
  maxHealth: 1,
  maxArmour: 1,
  regenPerSec: 0.02,
  punchRange: 2.4,
  punchDamage: 0.34,
  pistolDamage: 0.34,
  pistolRange: 55,
  pistolMag: 12,
};

export const CAR = {
  accel: 16,
  brake: 30,
  maxSpeed: 34,
  sportMax: 42,
  policeMax: 37,
  reverseMax: 12,
  steer: 1.9,
  radius: 1.6,
  length: 4.4,
  width: 2.0,
};

export const BOAT = {
  accel: 12,
  maxSpeed: 26,
  steer: 1.4,
  radius: 2.2,
};

export const WANTED = {
  decaySeconds: 26,
  maxStars: 5,
  maxCopCars: 6,
  maxFootCops: 3,
  bustedFine: 200,
  wastedFine: 150,
  sprayCost: 100,
};

export const ECONOMY = {
  startCash: 120,
  taxiBase: 45,
  taxiPerMetre: 0.35,
  boatRunPay: 260,
  missionPays: [150, 300, 200, 400, 500, 900],
};

// Warm sunset palette: pastel facades, teal sea, amber sun. Ground tones
// are kept muted and varied so the city floor never reads as one flat
// colour; block slabs pick from `pavement`.
export const PALETTE = {
  skyDay: 0x8fc7e8,
  skyDusk: 0xff8a3c,
  skyNight: 0x101a33,
  fogDusk: 0xdd7a44,
  sun: 0xffb347,
  sea: 0x2a7a99,
  sand: 0xe3c48d,
  grass: 0x74975a,
  road: 0x52575f,
  roadLine: 0xd8c56a,
  sidewalk: 0x9a938a,
  pavement: [0x8f887e, 0x9a938a, 0x7d8f6a, 0x8a9a6a, 0xa89a80, 0x6f9455],
  boardwalk: 0xb98d5f,
  building: [0xf2c9a0, 0xf7e3c0, 0xe8a87c, 0xcfe0e8, 0xf0b8c8, 0xd9c2e8, 0xffe1a8, 0xb8d8c8],
  neon: [0xff4d6d, 0x2fd6c2, 0xffb347, 0x7c5cff, 0x3ec6ff],
  car: [0xd84040, 0x3a6fd8, 0xe8b13c, 0x3fae6a, 0xe8e4da, 0x8a5fd0, 0x222831, 0xff7a3c],
  copCar: 0x1c2f4a,
  taxi: 0xf2c230,
};

// Named places the story and the HUD refer to. Every target sits on a road
// centre line (or just off it) so a car can actually reach it.
export const PLACES = {
  ricoBar: { x: -8, z: -160, name: "Rico's Bar", district: 'Old Harbor' },
  market: { x: 88, z: -80, name: 'Old Town Market', district: 'Old Harbor' },
  club: { x: 160, z: 88, name: 'Club Mirage', district: 'Golden Mile' },
  taxiStand: { x: 0, z: 160, name: 'Taxi Stand', district: 'Downtown' },
  beachPickup: { x: -240, z: 160, name: 'Coral Beach', district: 'Coral Beach' },
  port: { x: 280, z: -80, name: 'Port Aurelia', district: 'Port Aurelia' },
  stadium: { x: -80, z: 240, name: 'Aurelia Stadium', district: 'Marina' },
  spray: { x: 160, z: 168, name: 'Spray & Go', district: 'Downtown' },
  hospital: { x: 0, z: 240, name: 'St Mercy Hospital', district: 'Marina' },
  marina: { x: -288, z: 200, name: 'Marina Dock', district: 'Coral Beach' },
  boatDropA: { x: -340, z: 40, name: 'Smuggler Buoy', district: 'The Bay' },
  boatDropB: { x: -345, z: -180, name: 'North Buoy', district: 'The Bay' },
};

export function districtAt(x, z) {
  if (x < -252) return 'The Bay';
  if (x < -200) return 'Coral Beach';
  if (x > 252) return 'Port Aurelia';
  if (z < -200) return 'Golden Mile';
  if (z > 200) return 'Marina';
  if (x < -80 && z < -80) return 'Old Harbor';
  if (x > 80 && z > 80) return 'Downtown';
  if (Math.abs(x) < 80 && Math.abs(z) < 80) return 'Downtown';
  return 'Aurelia Bay';
}

export const MISSION_DEFS = [
  { id: 1, title: 'Welcome Home', brief: "Rico is waiting at his bar in Old Harbor. Drive over and say hello — the city is yours now.", pay: 150 },
  { id: 2, title: 'The Errand', brief: 'Pick up the package at Old Town Market and deliver it to Club Mirage. 75 seconds on the clock once you grab it.', pay: 300 },
  { id: 3, title: 'Night Shift', brief: 'Three fares are waving on the streets. Pick them up in a car and drop each one at its marker.', pay: 200 },
  { id: 4, title: 'Heat Check', brief: 'The crew needs to know you can handle heat. Get to 3 stars, then stay free for 25 seconds.', pay: 400 },
  { id: 5, title: 'Coast Run', brief: 'Grab the crate at Coral Beach and run it to Port Aurelia in 90 seconds. The cops already know your plates — 2 stars.', pay: 500 },
  { id: 6, title: 'The Big Score', brief: 'A red Veloce GT is parked at Aurelia Stadium. Steal it and bring it to Spray & Go in 100 seconds. 3 stars on you.', pay: 900 },
];
