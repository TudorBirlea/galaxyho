import { CONFIG, VERSION } from './config.js?v=3.6';
import { app } from './app.js?v=3.6';

const tooltipEl = document.getElementById('tooltip');
const ttName = document.getElementById('tt-name');
const ttClass = document.getElementById('tt-class');
const ttPlanets = document.getElementById('tt-planets');
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

  if (isShipHere) {
    ttDist.textContent = '';
    ttStatus.textContent = 'Current location';
    ttStatus.style.color = 'rgba(80,200,140,0.65)';
    ttEnter.style.display = 'block';
    ttJump.style.display = 'none';
  } else {
    ttDist.textContent = `${Math.round(distance * 10) / 10} ly`;
    ttStatus.textContent = isVisited ? 'Visited' : 'Unexplored';
    ttStatus.style.color = isVisited ? 'rgba(100,180,220,0.5)' : 'rgba(255,255,255,0.3)';
    ttEnter.style.display = 'none';
    ttJump.style.display = 'block';
    ttJump.textContent = `Jump (${Math.round(distance * 10) / 10} ly) →`;
  }

  tooltipEl.style.display = 'block';
  const tw = 210, th2 = 180;
  let x = screenX + 20, y = screenY - 30;
  if (x + tw > window.innerWidth) x = screenX - tw - 20;
  if (y + th2 > window.innerHeight) y = window.innerHeight - th2 - 10;
  if (y < 10) y = 10;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

export function hideTooltip() { tooltipEl.style.display = 'none'; }

export function showInfoCard(planet, snapshot) {
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

  infoCard.classList.add('visible');
}

export function hideInfoCard() { infoCard.classList.remove('visible'); }

const hudVersion = document.getElementById('hud-version');

export function updateHUD(galaxy, state) {
  hudProgress.textContent = `${state.visitedStars.size}/${galaxy.stars.length} explored`;
  const shipStar = galaxy.stars[state.shipStarId];
  if (shipStar) {
    hudShip.textContent = `Docked at ${shipStar.name}`;
  }
  if (hudVersion) hudVersion.textContent = `v${VERSION}`;
}

export function showLockMessage() {
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
        icon = '→'; text = `Jumped to ${toStar ? toStar.name : 'Unknown'} (${e.distance} ly)`;
        break;
      }
      case 'enter_system': {
        const star = galaxy.stars[e.starId];
        icon = '⊙'; text = `Entered ${star ? star.name : 'Unknown'} system`;
        break;
      }
      case 'scan_planet':
        icon = '◎'; text = `Scanned ${e.planetName} — ${e.planetType}`;
        break;
      case 'discovery':
        icon = '✦'; text = `Discovered: ${e.special}`;
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
