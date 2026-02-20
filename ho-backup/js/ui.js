import { CONFIG } from './config.js';

const tooltipEl = document.getElementById('tooltip');
const ttName = document.getElementById('tt-name');
const ttClass = document.getElementById('tt-class');
const ttPlanets = document.getElementById('tt-planets');
export const ttEnter = document.getElementById('tt-enter');
export const backBtn = document.getElementById('back-btn');
const infoCard = document.getElementById('info-card');
export const icClose = document.getElementById('ic-close');
export const hudLocation = document.getElementById('hud-location');
const hudProgress = document.getElementById('hud-progress');
export const overlay = document.getElementById('overlay');
const lockMsg = document.getElementById('lock-msg');

export function showTooltip(star, screenX, screenY) {
  const sc = CONFIG.spectral[star.spectralClass];
  ttName.textContent = star.name;
  ttClass.textContent = `Class ${star.spectralClass} · ${sc.tempLabel}`;
  ttPlanets.textContent = `${star.planetCount} planet${star.planetCount !== 1 ? 's' : ''}`;
  tooltipEl.style.display = 'block';
  const tw = 200, th2 = 140;
  let x = screenX + 20, y = screenY - 30;
  if (x + tw > window.innerWidth) x = screenX - tw - 20;
  if (y + th2 > window.innerHeight) y = window.innerHeight - th2 - 10;
  if (y < 10) y = 10;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

export function hideTooltip() { tooltipEl.style.display = 'none'; }

export function showInfoCard(planet) {
  document.getElementById('ic-name').textContent = planet.name;
  const typeEl = document.getElementById('ic-type');
  typeEl.textContent = planet.label;
  typeEl.className = 'type-' + planet.type;

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

export function updateHUD(galaxy, state) {
  hudProgress.textContent = `${state.visitedStars.size}/${galaxy.stars.length} explored`;
}

export function showLockMessage() {
  lockMsg.style.display = 'block';
  setTimeout(() => { lockMsg.style.display = 'none'; }, 2500);
}
