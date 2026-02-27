import { CONFIG, VERSION } from './config.js?v=6.0';
import { app } from './app.js?v=6.0';
import { getMaxFuel, getUpgradeEffects, calculateJumpFuelCost } from './gameplay.js?v=6.0';
import { getDockedPlanetId } from './ship.js?v=6.0';

const tooltipEl = document.getElementById('tooltip');
const ttName = document.getElementById('tt-name');
const ttClass = document.getElementById('tt-class');
const ttPlanets = document.getElementById('tt-planets');
const ttBelt = document.getElementById('tt-belt');
const ttComets = document.getElementById('tt-comets');
const ttDist = document.getElementById('tt-dist');
const ttStatus = document.getElementById('tt-status');
export const ttEnter = document.getElementById('tt-enter');
export const ttJump = document.getElementById('tt-jump');
export const backBtn = document.getElementById('back-btn');
const infoCard = document.getElementById('info-card');
export const icClose = document.getElementById('ic-close');
export const hudLocation = document.getElementById('hud-location');
const hudShip = document.getElementById('hud-ship');
const hudProgress = document.getElementById('hud-progress');
export const overlay = document.getElementById('overlay');
const lockMsg = document.getElementById('lock-msg');
// Ship status panel elements
const shipPanel = document.getElementById('ship-panel');
const spLocation = document.getElementById('sp-location');
const spFuelFill = document.getElementById('sp-fuel-fill');
const spFuelVal = document.getElementById('sp-fuel-val');
const spDataVal = document.getElementById('sp-data-val');
const spStarsVal = document.getElementById('sp-stars-val');
const spScannedVal = document.getElementById('sp-scanned-val');
const eventCard = document.getElementById('event-card');
const ecTitle = document.getElementById('ec-title');
const ecDescription = document.getElementById('ec-description');
const ecChoices = document.getElementById('ec-choices');
const outcomeOverlay = document.getElementById('outcome-overlay');
const ocResult = document.getElementById('oc-result');
const ocRewards = document.getElementById('oc-rewards');
const ocLore = document.getElementById('oc-lore');
const upgradePanel = document.getElementById('upgrade-panel');
const upgradeGrid = document.getElementById('upgrade-grid');
const upgradeDataDisplay = document.getElementById('upgrade-data-display');
export const upgradeBtn = document.getElementById('upgrade-btn');
export const upgradeClose = document.getElementById('upgrade-close');
export const journalBtn = document.getElementById('journal-btn');
export const journalClose = document.getElementById('journal-close');
const journalPanel = document.getElementById('journal-panel');
const journalEntries = document.getElementById('journal-entries');
const journalNotice = document.getElementById('journal-notice');

export function showTooltip(star, screenX, screenY, distance, isShipHere, isVisited) {
  const sc = CONFIG.spectral[star.spectralClass];
  ttName.textContent = star.name;
  // v3: Show remnant type instead of spectral class
  if (star.remnantType === 'blackHole') {
    ttClass.textContent = 'Black Hole';
  } else if (star.remnantType === 'neutronStar') {
    ttClass.textContent = 'Neutron Star';
  } else if (star.remnantType === 'whiteDwarf') {
    ttClass.textContent = 'White Dwarf';
  } else {
    ttClass.textContent = `Class ${star.spectralClass} · ${sc.tempLabel}`;
  }
  ttPlanets.textContent = `${star.planetCount} planet${star.planetCount !== 1 ? 's' : ''}`;
  ttBelt.textContent = star.hasBelt ? 'Asteroid belt' : '';
  ttBelt.style.display = star.hasBelt ? 'block' : 'none';
  ttComets.textContent = star.hasComets ? 'Comet activity' : '';
  ttComets.style.display = star.hasComets ? 'block' : 'none';

  if (isShipHere) {
    ttDist.textContent = '';
    ttStatus.textContent = 'Current location';
    ttStatus.style.color = 'rgba(80,200,140,0.65)';
    ttEnter.style.display = 'block';
    ttJump.style.display = 'none';
  } else {
    const fuelCost = app.state ? calculateJumpFuelCost(app.galaxy.stars[app.state.shipStarId], star, app.state) : 0;
    const canAfford = app.state ? app.state.fuel >= fuelCost : true;
    ttDist.textContent = `${Math.round(distance * 10) / 10} ly`;
    ttStatus.textContent = isVisited ? 'Visited' : 'Unexplored';
    ttStatus.style.color = isVisited ? 'rgba(100,180,220,0.5)' : 'rgba(255,255,255,0.3)';
    ttEnter.style.display = 'none';
    ttJump.style.display = 'block';
    if (canAfford) {
      ttJump.textContent = `Jump (${fuelCost} fuel) →`;
      ttJump.style.color = '';
    } else if (star.id === 0) {
      // Emergency jump home is always available
      ttJump.textContent = 'Emergency jump (free) →';
      ttJump.style.color = 'rgba(220,180,60,0.6)';
    } else {
      ttJump.textContent = `Need ${fuelCost} fuel`;
      ttJump.style.color = 'rgba(220,80,60,0.6)';
    }
  }

  tooltipEl.style.display = 'block';
  const tw = 230, th2 = 200;
  let x = screenX + 20, y = screenY - 30;
  if (x + tw > window.innerWidth) x = screenX - tw - 20;
  if (y + th2 > window.innerHeight) y = window.innerHeight - th2 - 10;
  if (y < 10) y = 10;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

export function hideTooltip() { tooltipEl.style.display = 'none'; }

let currentInfoPlanet = null;
let activeActionTimer = null;
const icActionResult = document.getElementById('ic-action-result');
const ACTION_DURATIONS = { scan: 0, mine: 1500, explore: 2000 };
const ACTION_KEYS = { scan: 'scanned', mine: 'mined', explore: 'explored' };

export function showInfoCard(planet, snapshot) {
  currentInfoPlanet = planet;
  document.getElementById('ic-name').textContent = planet.name;
  const typeEl = document.getElementById('ic-type');
  typeEl.textContent = planet.label;
  typeEl.className = 'type-' + planet.type;
  const photoEl = document.getElementById('ic-photo');
  photoEl.src = snapshot || '';
  photoEl.style.display = snapshot ? 'block' : 'none';

  const habColor = planet.habitability > 60 ? 'rgba(80,200,140,0.5)' : planet.habitability > 30 ? 'rgba(200,200,80,0.4)' : 'rgba(200,100,80,0.35)';
  const statsHtml = `
    <div class="ic-row"><span class="ic-label">Size</span><div class="ic-bar"><div class="ic-fill" style="width:${planet.size*10}%;background:rgba(140,200,180,0.45)"></div></div><span class="ic-value">${planet.size}/10</span></div>
    <div class="ic-row"><span class="ic-label">Habitability</span><div class="ic-bar"><div class="ic-fill" style="width:${planet.habitability}%;background:${habColor}"></div></div><span class="ic-value">${planet.habitability}%</span></div>
    <div class="ic-row"><span class="ic-label">Metals</span><div class="ic-bar"><div class="ic-fill" style="width:${planet.metalRichness}%;background:rgba(200,170,100,0.4)"></div></div><span class="ic-value">${planet.metalRichness}%</span></div>
    <div class="ic-atm">Atmosphere: ${planet.atmosphere.charAt(0).toUpperCase() + planet.atmosphere.slice(1)}</div>`;
  document.getElementById('ic-stats').innerHTML = statsHtml;

  const specialEl = document.getElementById('ic-special');
  if (planet.special) { specialEl.textContent = planet.special; specialEl.style.display = 'block'; }
  else { specialEl.style.display = 'none'; }

  updateActionButtons(planet);
  if (icActionResult) icActionResult.textContent = '';
  infoCard.classList.add('visible');
}

export function hideInfoCard() {
  infoCard.classList.remove('visible');
  currentInfoPlanet = null;
  if (activeActionTimer) { clearTimeout(activeActionTimer); activeActionTimer = null; }
}

function updateActionButtons(planet) {
  const actions = app.getPlanetActions ? app.getPlanetActions(planet) : {};
  const effects = getUpgradeEffects(app.state);
  const shipHere = getDockedPlanetId() === planet.id || effects.orbitalScan;
  const actionsWrap = document.getElementById('ic-actions');
  actionsWrap.classList.toggle('locked', !shipHere);
  document.querySelectorAll('#ic-actions .ic-action').forEach(el => {
    const action = el.dataset.action;
    const stateKey = ACTION_KEYS[action];
    const done = actions[stateKey] || false;
    el.classList.toggle('done', done);
    el.classList.remove('active');
    el.querySelector('.ic-action-progress').style.width = '0';
    el.querySelector('.ic-action-progress').style.transition = 'none';
  });
}

function startAction(actionEl, action) {
  if (!currentInfoPlanet || !app.performPlanetAction) return;
  const stateKey = ACTION_KEYS[action];
  const actions = app.getPlanetActions(currentInfoPlanet);
  if (actions[stateKey]) return;

  const duration = ACTION_DURATIONS[action];
  actionEl.classList.add('active');

  if (duration === 0) {
    // Instant action
    completeAction(actionEl, action);
  } else {
    // Timed action with progress bar
    const prog = actionEl.querySelector('.ic-action-progress');
    prog.style.width = '0';
    requestAnimationFrame(() => {
      prog.style.transition = `width ${duration}ms linear`;
      prog.style.width = '100%';
    });
    activeActionTimer = setTimeout(() => {
      activeActionTimer = null;
      completeAction(actionEl, action);
    }, duration);
  }
}

function completeAction(actionEl, action) {
  const stateKey = ACTION_KEYS[action];
  const result = app.performPlanetAction(currentInfoPlanet, stateKey);
  actionEl.classList.remove('active');
  actionEl.classList.add('done');

  // Show reward inline
  if (icActionResult && result) {
    if (result.fuel) {
      icActionResult.innerHTML = `<span class="ic-result-fuel">+${result.fuel} fuel</span>`;
    } else if (result.data) {
      icActionResult.innerHTML = `<span class="ic-result-data">+${result.data} data</span>` +
        (result.event ? ` <span class="ic-result-event">Event!</span>` : '');
    }
    setTimeout(() => { if (icActionResult) icActionResult.textContent = ''; }, 2500);
  }
}

// Wire action button clicks
document.querySelectorAll('#ic-actions .ic-action').forEach(el => {
  el.addEventListener('click', () => {
    if (el.closest('#ic-actions').classList.contains('locked')) return;
    if (el.classList.contains('done') || el.classList.contains('active') || activeActionTimer) return;
    startAction(el, el.dataset.action);
  });
});

const hudVersion = document.getElementById('hud-version');

export function updateHUD(galaxy, state) {
  hudProgress.textContent = `${state.visitedStars.size}/${galaxy.stars.length} explored`;
  const shipStar = galaxy.stars[state.shipStarId];
  if (shipStar) {
    hudShip.textContent = `Docked at ${shipStar.name}`;
    spLocation.textContent = shipStar.name;
  }
  if (hudVersion) hudVersion.textContent = `v${VERSION}`;
  updateFuelGauge(state);
  updateDataDisplay(state);
  spStarsVal.textContent = `${state.visitedStars.size}/${galaxy.stars.length}`;
  spScannedVal.textContent = `${state.scannedPlanets.size}`;
}

export function showLockMessage(msg) {
  if (msg) lockMsg.textContent = msg;
  else lockMsg.textContent = 'Explore more stars to unlock';
  lockMsg.style.display = 'block';
  setTimeout(() => { lockMsg.style.display = 'none'; }, 2500);
}

// ── Journal ──

export function toggleJournal() {
  app.journalVisible = !app.journalVisible;
  journalPanel.classList.toggle('visible', app.journalVisible);
}

export function renderJournal(journal, galaxy) {
  journalEntries.innerHTML = '';
  const entries = [...journal].reverse();
  for (const e of entries) {
    const div = document.createElement('div');
    div.className = 'journal-entry';
    let icon = '', text = '';
    const time = new Date(e.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    switch (e.type) {
      case 'start': {
        const star = galaxy.stars[e.starId];
        icon = '◈'; text = `Journey began at ${star ? star.name : 'Unknown'}`;
        break;
      }
      case 'jump': {
        const toStar = galaxy.stars[e.toStarId];
        const fuelNote = e.fuelCost ? ` · ${e.fuelCost} fuel` : '';
        icon = '→'; text = `Jumped to ${toStar ? toStar.name : 'Unknown'} (${e.distance} ly${fuelNote})`;
        break;
      }
      case 'enter_system': {
        const star = galaxy.stars[e.starId];
        icon = '⊙'; text = `Entered ${star ? star.name : 'Unknown'} system`;
        break;
      }
      case 'scan_planet': {
        const rewards = (e.fuelGain || e.dataGain) ? ` (+${e.fuelGain || 0} fuel, +${e.dataGain || 0} data)` : '';
        icon = '◎'; text = `Scanned ${e.planetName} — ${e.planetType}${rewards}`;
        break;
      }
      case 'discovery':
        icon = '✦'; text = `Discovered: ${e.special}`;
        break;
      case 'event':
        icon = e.success ? '✧' : '⚠'; text = `${e.title}: ${e.lore}`;
        break;
    }
    div.innerHTML = `<span class="je-icon">${icon}</span><span class="je-text">${text}</span><span class="je-time">${timeStr}</span>`;
    journalEntries.appendChild(div);
  }
}

export function showJournalNotice() {
  if (app.journalVisible) return;
  journalNotice.style.opacity = '1';
  setTimeout(() => { journalNotice.style.opacity = '0'; }, 2000);
}

// ── v5: Fuel gauge ──

export function updateFuelGauge(state) {
  const max = getMaxFuel(state);
  const pct = Math.max(0, Math.min(100, (state.fuel / max) * 100));
  spFuelFill.style.width = pct + '%';
  spFuelVal.textContent = `${Math.round(state.fuel)}/${max}`;
  if (pct > 50) spFuelFill.style.background = 'rgba(80,200,140,0.5)';
  else if (pct > 25) spFuelFill.style.background = 'rgba(220,180,60,0.5)';
  else spFuelFill.style.background = 'rgba(220,80,60,0.5)';
  shipPanel.classList.toggle('low-fuel', state.fuel < CONFIG.gameplay.lowFuelThreshold);
}

// ── v5: Data display ──

export function updateDataDisplay(state) {
  spDataVal.textContent = state.data;
}

export function flashData() {
  spDataVal.classList.add('flash');
  setTimeout(() => spDataVal.classList.remove('flash'), 400);
}

// ── v5: Event card ──

export function showEventCard(eventInstance, onChoice) {
  ecTitle.textContent = eventInstance.title;
  ecDescription.textContent = eventInstance.description;
  ecChoices.innerHTML = '';
  eventInstance.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'ec-choice';
    btn.innerHTML = `<span>${choice.label}</span><span class="ec-risk ${choice.risk}">${choice.risk}</span>`;
    btn.addEventListener('click', () => {
      hideEventCard();
      onChoice(i);
    });
    ecChoices.appendChild(btn);
  });
  eventCard.classList.add('visible');
  app.eventCardVisible = true;
}

export function hideEventCard() {
  eventCard.classList.remove('visible');
  app.eventCardVisible = false;
}

export function showOutcome(outcome, onDismiss) {
  ocResult.textContent = outcome.success ? 'Success' : 'Failure';
  ocResult.className = outcome.success ? 'success' : 'failure';
  let rewardsHtml = '';
  if (outcome.fuel > 0) rewardsHtml += `<span class="oc-fuel-gain">+${outcome.fuel} fuel</span>  `;
  else if (outcome.fuel < 0) rewardsHtml += `<span class="oc-fuel-loss">${outcome.fuel} fuel</span>  `;
  if (outcome.data > 0) rewardsHtml += `<span class="oc-data-gain">+${outcome.data} data</span>`;
  else if (outcome.data < 0) rewardsHtml += `<span class="oc-data-gain">${outcome.data} data</span>`;
  ocRewards.innerHTML = rewardsHtml || 'No rewards';
  if (outcome.lore) { ocLore.textContent = outcome.lore; ocLore.style.display = 'block'; }
  else { ocLore.style.display = 'none'; }
  outcomeOverlay.classList.add('visible');
  setTimeout(() => {
    outcomeOverlay.classList.remove('visible');
    if (onDismiss) onDismiss();
  }, 2500);
}

// ── v5: Upgrade panel ──

export function showUpgradePanel(state, upgradeTree, onPurchase) {
  upgradeDataDisplay.textContent = `Data: ${state.data}`;
  upgradeGrid.innerHTML = '';
  for (const [catId, cat] of Object.entries(upgradeTree)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'ug-category';
    catDiv.innerHTML = `<div class="ug-cat-title"><span class="ug-cat-icon">${cat.icon}</span>${cat.label}</div>`;
    cat.tiers.forEach((tier, tierIdx) => {
      const tierNum = tierIdx + 1;
      const owned = state.upgrades[catId] >= tierNum;
      const canBuy = !owned && state.upgrades[catId] >= tierIdx && state.data >= tier.cost;
      const locked = !owned && state.upgrades[catId] < tierIdx;
      const tierDiv = document.createElement('div');
      tierDiv.className = 'ug-tier';
      let statusHtml;
      if (owned) {
        statusHtml = '<span class="ug-owned">Installed</span>';
      } else if (locked) {
        statusHtml = '<span class="ug-locked">Locked</span>';
      } else {
        const btn = `<button class="ug-buy-btn" data-cat="${catId}" data-tier="${tierNum}" ${canBuy ? '' : 'disabled'}>${canBuy ? 'Install' : 'Insufficient data'}</button>`;
        statusHtml = btn;
      }
      tierDiv.innerHTML = `<div class="ug-tier-name">${tier.label}</div><div class="ug-tier-desc">${tier.description}</div><div class="ug-tier-cost">${tier.cost} data</div>${statusHtml}`;
      catDiv.appendChild(tierDiv);
    });
    upgradeGrid.appendChild(catDiv);
  }
  // Wire buy buttons
  upgradeGrid.querySelectorAll('.ug-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      const tier = parseInt(btn.dataset.tier);
      if (onPurchase(cat, tier)) {
        showUpgradePanel(state, upgradeTree, onPurchase); // re-render
      }
    });
  });
  upgradePanel.classList.add('visible');
  app.upgradesPanelVisible = true;
}

export function hideUpgradePanel() {
  upgradePanel.classList.remove('visible');
  app.upgradesPanelVisible = false;
}

// ── System Summary Panel ──
const systemPanel = document.getElementById('system-panel');
const syspName = document.getElementById('sysp-name');
const syspBadge = document.getElementById('sysp-badge');
const syspTemp = document.getElementById('sysp-temp');
const syspPlanets = document.getElementById('sysp-planets');
const syspBelt = document.getElementById('sysp-belt');
const syspComets = document.getElementById('sysp-comets');

let _currentSysStar = null;

const SPECTRAL_BADGE_COLORS = {
  O: 'rgba(34,68,255,0.7)',
  B: 'rgba(34,204,255,0.7)',
  A: 'rgba(51,238,187,0.7)',
  F: 'rgba(238,221,68,0.7)',
  G: 'rgba(255,187,0,0.7)',
  K: 'rgba(255,119,0,0.7)',
  M: 'rgba(255,34,0,0.7)',
};

export function showSystemPanel(star) {
  _currentSysStar = star;
  syspName.textContent = star.name;

  if (star.remnantType === 'blackHole') {
    syspBadge.textContent = 'Black Hole';
    syspBadge.style.background = 'rgba(40,0,60,0.6)';
    syspBadge.style.color = 'rgba(200,120,255,0.8)';
    syspTemp.textContent = '';
  } else if (star.remnantType === 'neutronStar') {
    syspBadge.textContent = 'Neutron Star';
    syspBadge.style.background = 'rgba(0,40,60,0.6)';
    syspBadge.style.color = 'rgba(120,200,255,0.8)';
    syspTemp.textContent = '';
  } else if (star.remnantType === 'whiteDwarf') {
    syspBadge.textContent = 'White Dwarf';
    syspBadge.style.background = 'rgba(60,60,60,0.5)';
    syspBadge.style.color = 'rgba(220,220,240,0.8)';
    syspTemp.textContent = '';
  } else {
    const sc = CONFIG.spectral[star.spectralClass];
    syspBadge.textContent = `Class ${star.spectralClass}`;
    syspBadge.style.background = SPECTRAL_BADGE_COLORS[star.spectralClass] || 'rgba(255,255,255,0.15)';
    syspBadge.style.color = 'rgba(0,0,0,0.75)';
    syspTemp.textContent = sc ? sc.tempLabel : '';
  }

  syspBelt.textContent = star.hasBelt ? '◆ Asteroid Belt' : '';
  syspComets.textContent = star.hasComets ? '◆ Comet Activity' : '';

  updateSystemPanel();
  systemPanel.style.display = 'block';
}

export function hideSystemPanel() {
  systemPanel.style.display = 'none';
  _currentSysStar = null;
}

export function updateSystemPanel() {
  if (!_currentSysStar) return;
  const planets = app.systemPlanets || [];
  const total = planets.length;
  let explored = 0;
  for (const p of planets) {
    const key = `${_currentSysStar.id}-${p.data.id}`;
    const actions = app.state.planetActions[key];
    if (actions && actions.scanned && actions.mined && actions.explored) explored++;
  }
  syspPlanets.innerHTML = `<span>${total}</span> planets · <span>${explored}</span> complete`;
}
