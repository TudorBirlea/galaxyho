import { CONFIG } from './config.js?v=3.1';

const canvas = document.getElementById('minimap');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const R = CONFIG.galaxy.fieldRadius;
const PAD = 12;

function starToCanvas(star) {
  const scale = (W - PAD * 2) / (R * 2);
  return {
    x: PAD + (star.position.x + R) * scale,
    y: PAD + (star.position.z + R) * scale, // top-down: use x,z
  };
}

export function drawMinimap(galaxy, state, selectedStar) {
  ctx.clearRect(0, 0, W, H);

  const stars = galaxy.stars;

  // Draw connections
  const drawn = new Set();
  ctx.lineWidth = 0.5;
  for (const star of stars) {
    for (const adjId of star.adjacentIds) {
      const key = Math.min(star.id, adjId) + '-' + Math.max(star.id, adjId);
      if (drawn.has(key)) continue;
      drawn.add(key);
      const adj = stars[adjId];
      const a = starToCanvas(star), b = starToCanvas(adj);
      const bothReachable = state.reachableStars.has(star.id) && state.reachableStars.has(adjId);
      ctx.strokeStyle = bothReachable ? 'rgba(80,120,180,0.15)' : 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Draw stars
  for (const star of stars) {
    const p = starToCanvas(star);
    const reachable = state.reachableStars.has(star.id);
    const visited = state.visitedStars.has(star.id);
    const sc = CONFIG.spectral[star.spectralClass];
    const col = sc.color;
    const r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, b_c = col & 0xff;

    if (!reachable) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const alpha = visited ? 0.7 : 0.4;
      ctx.fillStyle = `rgba(${r},${g},${b_c},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, visited ? 2.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw selection ring
  if (selectedStar) {
    const p = starToCanvas(selectedStar);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw ship marker (pulsing diamond)
  const shipStar = stars[state.shipStarId];
  if (shipStar) {
    const p = starToCanvas(shipStar);
    ctx.fillStyle = 'rgba(80,220,160,0.9)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 4);
    ctx.lineTo(p.x + 3, p.y);
    ctx.lineTo(p.x, p.y + 4);
    ctx.lineTo(p.x - 3, p.y);
    ctx.closePath();
    ctx.fill();
  }
}
