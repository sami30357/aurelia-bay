// Aurelia Bay — HUD: DOM overlays (title, pause, briefing, busted,
// wasted, story-complete) plus the circular minimap canvas.
// One job: show the game state; the rules never read from here.

import { MISSION_DEFS, districtAt } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const clockEl = el('clock');
  const radioEl = el('radio');
  const objectiveEl = el('objective-text');
  const objectiveTitleEl = el('objective-title');
  const starsEl = el('stars');
  const cashEl = el('cash');
  const districtEl = el('district');
  const healthFill = el('health-fill');
  const armourFill = el('armour-fill');
  const speedEl = el('speed');
  const ammoEl = el('ammo');
  const promptEl = el('prompt');
  const toastEl = el('toast');
  const vignette = el('vignette');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const overlayBtn = el('overlay-btn');
  const overlayKeys = el('overlay-keys');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');

  let toastTimer = 0;
  let bannerTimer = 0;

  function fmtClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function toast(message, seconds) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = seconds || 3;
  }

  function banner(title, sub, seconds) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    bannerEl.hidden = false;
    bannerTimer = seconds || 3.5;
  }

  function showOverlay(title, copy, button, keysHtml) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayBtn.textContent = button;
    overlayKeys.innerHTML = keysHtml || '';
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function update(g, dt) {
    clockEl.textContent = fmtClock(g.clockMinutes);
    radioEl.textContent = g.radioName;
    objectiveEl.textContent = g.missions.state.objective;
    const def = MISSION_DEFS[g.missions.state.index];
    objectiveTitleEl.textContent = def ? `MISSION ${def.id} — ${def.title.toUpperCase()}` : 'FREE ROAM';
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < g.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.style.color = g.wanted > 0 ? '#ff5a3c' : '#e9e6df';
    cashEl.textContent = `$${Math.floor(g.cash)}`;
    const px = g.player.inCar && g.player.car ? g.player.car.x : g.player.x;
    const pz = g.player.inCar && g.player.car ? g.player.car.z : g.player.z;
    districtEl.textContent = districtAt(px, pz);
    healthFill.style.width = `${Math.round(g.player.health * 100)}%`;
    armourFill.style.width = `${Math.round(g.player.armour * 100)}%`;
    if (g.player.inCar && g.player.car) {
      speedEl.textContent = `${Math.round(Math.abs(g.player.car.speed) * 3.6)} km/h`;
      ammoEl.textContent = '';
    } else if (g.player.inBoat) {
      speedEl.textContent = `${Math.round(Math.abs(g.player.boat.speed) * 3.6)} km/h`;
      ammoEl.textContent = '';
    } else {
      speedEl.textContent = '';
      ammoEl.textContent = `Ammo ${g.player.ammo} / ${g.player.mag}`;
    }
    promptEl.hidden = !g.prompt;
    if (g.prompt) promptEl.textContent = g.prompt;
    vignette.style.opacity = g.player.health < 0.35 ? String(0.7 - g.player.health) : '0';

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.hidden = true;
    }
    // Staged shots hold their banner for the whole frame; live play uses
    // the timer.
    if (g.bannerHold) {
      bannerTitle.textContent = g.bannerHold.title;
      bannerSub.textContent = g.bannerHold.sub || '';
      bannerEl.hidden = false;
    } else if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.hidden = true;
    }
    drawMinimap(g, px, pz);
  }

  // Circular minimap: roads, sea, mission diamond, cop blips, player arrow.
  function drawMinimap(g, px, pz) {
    const size = minimap.width;
    const c = size / 2;
    const scale = size / 760; // world -380..380 maps onto the disc
    mctx.clearRect(0, 0, size, size);
    mctx.save();
    mctx.beginPath();
    mctx.arc(c, c, c - 2, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = '#20262e';
    mctx.fillRect(0, 0, size, size);
    // Sea (west).
    mctx.fillStyle = '#2e7f9e';
    mctx.fillRect(0, 0, (size / 760) * 80, size);
    // Sand strip.
    mctx.fillStyle = '#e8cf9e';
    mctx.fillRect((size / 760) * 80, 0, 6, size);
    // Roads.
    mctx.strokeStyle = '#565e68';
    mctx.lineWidth = 5;
    const roads = [-240, -160, -80, 0, 80, 160, 240];
    for (const r of roads) {
      const v = c + r * scale;
      mctx.beginPath(); mctx.moveTo(v, 0); mctx.lineTo(v, size); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, v); mctx.lineTo(size, v); mctx.stroke();
    }
    // Mission diamond.
    const target = g.missions.state.target;
    if (target) {
      const tx = c + target.x * scale;
      const ty = c + target.z * scale;
      mctx.fillStyle = '#ffd23c';
      mctx.beginPath();
      mctx.moveTo(tx, ty - 7); mctx.lineTo(tx + 6, ty); mctx.lineTo(tx, ty + 7); mctx.lineTo(tx - 6, ty);
      mctx.closePath(); mctx.fill();
    }
    // Cop blips (flashing).
    if (Math.floor(g.elapsed * 3) % 2 === 0) {
      mctx.fillStyle = '#ff4d6d';
      for (const cop of g.police.copCars) {
        mctx.beginPath();
        mctx.arc(c + cop.x * scale, c + cop.z * scale, 3.5, 0, Math.PI * 2);
        mctx.fill();
      }
    }
    // Player arrow.
    mctx.save();
    mctx.translate(c + px * scale, c + pz * scale);
    mctx.rotate(g.player.angle);
    mctx.fillStyle = '#e9e6df';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6);
    mctx.closePath(); mctx.fill();
    mctx.restore();
    mctx.restore();
    mctx.strokeStyle = '#e9e6df';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(c, c, c - 2, 0, Math.PI * 2);
    mctx.stroke();
  }

  return { update, toast, banner, showOverlay, hideOverlay, overlayBtn, fmtClock };
}
