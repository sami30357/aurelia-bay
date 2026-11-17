// Aurelia Bay — the story chain, the taxi side job and boat runs.
// One job: mission state. The loop feeds it the player's position and
// events; it answers with the current objective, marker and rewards.

import { ECONOMY, MISSION_DEFS, PLACES } from './config.js';
import { addWanted } from './police.js';

export function createMissions(random) {
  const state = {
    index: 0, // 0-based; 6 means the story is complete
    stage: 'go', // go | pickup | deliver | fares | heat | done
    timer: 0,
    heatTimer: 0,
    faresDone: 0,
    fare: null, // active fare ped (mission 3 or free-roam taxi)
    fareDest: null,
    fareStart: null,
    target: null, // { x, z, label }
    objective: '',
    message: '',
  };

  function setTarget(x, z, label) {
    state.target = { x, z, label };
  }

  function startMission(index) {
    state.index = index;
    state.justStarted = true;
    state.stage = 'go';
    state.timer = 0;
    state.heatTimer = 0;
    state.faresDone = 0;
    state.fare = null;
    state.fareDest = null;
    const def = MISSION_DEFS[index];
    if (!def) {
      state.objective = 'Free roam — Aurelia Bay is yours.';
      state.target = null;
      return;
    }
    if (index === 0) {
      setTarget(PLACES.ricoBar.x, PLACES.ricoBar.z, "Rico's Bar");
      state.objective = "Drive to Rico's Bar";
    } else if (index === 1) {
      setTarget(PLACES.market.x, PLACES.market.z, 'Old Town Market');
      state.objective = 'Pick up the package at Old Town Market';
    } else if (index === 2) {
      setTarget(PLACES.taxiStand.x, PLACES.taxiStand.z, 'Taxi Stand');
      state.objective = 'Get in a car — three fares are waiting';
    } else if (index === 3) {
      state.objective = 'Get to 3 stars, then stay free for 25 seconds';
      state.target = null;
    } else if (index === 4) {
      setTarget(PLACES.beachPickup.x, PLACES.beachPickup.z, 'Coral Beach');
      state.objective = 'Pick up the crate at Coral Beach';
    } else if (index === 5) {
      setTarget(PLACES.stadium.x, PLACES.stadium.z, 'Aurelia Stadium');
      state.objective = 'Steal the red Veloce GT at the stadium';
    }
    state.message = `${def.title} — ${def.brief}`;
  }

  function completeMission(game) {
    const pay = ECONOMY.missionPays[state.index] ?? 0;
    game.cash += pay;
    game.missionsDone += 1;
    state.message = `Mission complete — $${pay} in your pocket.`;
    startMission(state.index + 1);
    if (state.index >= MISSION_DEFS.length) {
      state.stage = 'done';
      state.objective = 'Story complete — free roam Aurelia Bay';
      state.target = null;
      state.message = 'THE BIG SCORE is done. Aurelia Bay is yours, boss.';
    }
  }

  function failMission(game, reason) {
    state.message = `Mission failed — ${reason}. Try again.`;
    startMission(state.index);
  }

  // Called every step with the live game state. Returns 'complete' |
  // 'failed' | null, and sets state.objective / state.target / timers.
  function step(dt, game, player, helpers) {
    const idx = state.index;
    if (idx >= MISSION_DEFS.length) return null;
    if (state.justStarted) {
      state.justStarted = false;
      onMissionStart(game); // mission 5 starts hot: 2 stars on you
    }
    const px = player.inCar && player.car ? player.car.x : player.x;
    const pz = player.inCar && player.car ? player.car.z : player.z;
    const near = (t, r) => t && Math.hypot(t.x - px, t.z - pz) < r;

    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        failMission(game, 'out of time');
        return 'failed';
      }
    }

    if (idx === 0) {
      if (near(state.target, 9)) { completeMission(game); return 'complete'; }
    } else if (idx === 1) {
      if (state.stage === 'go' && near(state.target, 9)) {
        state.stage = 'deliver';
        state.timer = 75;
        setTarget(PLACES.club.x, PLACES.club.z, 'Club Mirage');
        state.objective = 'Deliver the package to Club Mirage — 75s';
        state.message = 'Package grabbed. 75 seconds — move!';
      } else if (state.stage === 'deliver' && near(state.target, 9)) {
        completeMission(game); return 'complete';
      }
    } else if (idx === 2) {
      if (state.faresDone >= 3) { completeMission(game); return 'complete'; }
      if (!state.fare) {
        const fare = helpers.spawnFare();
        if (fare) {
          state.fare = fare;
          setTarget(fare.x, fare.z, 'Fare waving');
          state.objective = `Pick up fare ${state.faresDone + 1} of 3 — drive close and press T`;
        }
      } else if (!state.fareDest) {
        if (state.fare.state === 'riding') {
          state.fareDest = helpers.randomFareDest();
          setTarget(state.fareDest.x, state.fareDest.z, 'Drop-off');
          state.objective = `Drop fare ${state.faresDone + 1} of 3 at the marker`;
        }
      } else if (near(state.target, 10) && state.fare.state === 'riding') {
        const pay = ECONOMY.taxiBase + Math.round(ECONOMY.taxiPerMetre * (state.fareStart ? Math.hypot(state.fareDest.x - state.fareStart.x, state.fareDest.z - state.fareStart.z) : 100));
        game.cash += pay;
        game.faresDone += 1;
        state.faresDone += 1;
        state.fare.state = 'walk';
        state.fare.fare = null;
        state.fare = null;
        state.fareDest = null;
        state.message = `Fare dropped — $${pay}.`;
        if (state.faresDone >= 3) { completeMission(game); return 'complete'; }
      }
    } else if (idx === 3) {
      if (game.wanted >= 3) {
        state.heatTimer += dt;
        state.objective = `Stay free — ${Math.ceil(25 - state.heatTimer)}s left at 3 stars`;
        if (state.heatTimer >= 25) { completeMission(game); return 'complete'; }
      } else {
        state.heatTimer = 0;
        state.objective = 'Get to 3 stars — steal a car, or start some trouble';
      }
    } else if (idx === 4) {
      if (state.stage === 'go' && near(state.target, 9)) {
        state.stage = 'deliver';
        state.timer = 90;
        setTarget(PLACES.port.x, PLACES.port.z, 'Port Aurelia');
        state.objective = 'Run the crate to Port Aurelia — 90s';
        state.message = 'Crate loaded. 90 seconds — the port is east.';
      } else if (state.stage === 'deliver' && near(state.target, 9)) {
        completeMission(game); return 'complete';
      }
    } else if (idx === 5) {
      if (state.stage === 'go') {
        // The Veloce GT waits at the stadium; stealing it starts the run.
        const veloce = helpers.veloceCar();
        if (veloce && player.inCar && player.car === veloce) {
          state.stage = 'deliver';
          state.timer = 100;
          addWanted(game, 3);
          setTarget(PLACES.spray.x, PLACES.spray.z, 'Spray & Go');
          state.objective = 'Deliver the Veloce GT to Spray & Go — 100s';
          state.message = 'The Veloce is yours. 100 seconds — lose the cops at Spray & Go!';
        }
      } else if (near(state.target, 10)) {
        completeMission(game); return 'complete';
      }
    }
    return null;
  }

  function onMissionStart(game) {
    if (state.index === 4) addWanted(game, 2);
    if (state.index === 5) {
      // The Veloce spawns at the stadium when the mission begins.
    }
  }

  startMission(0);
  return { state, startMission, completeMission, failMission, step, onMissionStart };
}
