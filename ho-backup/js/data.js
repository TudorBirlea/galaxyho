import { CONFIG } from './config.js';
import { mulberry32, hashInt, lerp, genStarName, pickSpectralClass, ROMAN, SPECIALS } from './utils.js';

export function generateGalaxy(seed) {
  const rng = mulberry32(seed);
  const { starCount: N, fieldRadius: R, fieldHeight: H, minStarDist: minD,
          maxConnections: maxConn, connectionRange: connRange } = CONFIG.galaxy;
  const stars = [];

  // Generate star positions — Poisson-disc in a flat disc
  let attempts = 0;
  while (stars.length < N && attempts < N * 100) {
    attempts++;
    const r = Math.sqrt(rng()) * R;
    const theta = rng() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = (rng() - 0.5) * H * (1 - r / R * 0.6);

    let tooClose = false;
    for (const s of stars) {
      const dx = s.position.x - x, dy = s.position.y - y, dz = s.position.z - z;
      if (dx * dx + dy * dy + dz * dz < minD * minD) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const sc = pickSpectralClass(rng);
    const sid = hashInt(seed, stars.length);
    stars.push({
      id: stars.length,
      name: genStarName(sid),
      position: { x, y, z },
      spectralClass: sc,
      planetCount: CONFIG.spectral[sc].minPlanets + Math.floor(rng() * (CONFIG.spectral[sc].maxPlanets - CONFIG.spectral[sc].minPlanets + 1)),
      seed: sid,
      visited: false,
      adjacentIds: [],
    });
  }

  // Move the star closest to center to index 0 (home star)
  let closestIdx = 0, closestDist = Infinity;
  for (let i = 0; i < stars.length; i++) {
    const { x, y, z } = stars[i].position;
    const d = x * x + y * y + z * z;
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }
  if (closestIdx !== 0) {
    [stars[0], stars[closestIdx]] = [stars[closestIdx], stars[0]];
    stars[0].id = 0;
    stars[closestIdx].id = closestIdx;
  }

  // Build adjacency — each star connects to nearest neighbors within range
  for (let i = 0; i < stars.length; i++) {
    const dists = [];
    for (let j = 0; j < stars.length; j++) {
      if (i === j) continue;
      const dx = stars[i].position.x - stars[j].position.x;
      const dy = stars[i].position.y - stars[j].position.y;
      const dz = stars[i].position.z - stars[j].position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= connRange) dists.push({ id: j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    const count = Math.min(dists.length, maxConn);
    for (let k = 0; k < count; k++) {
      const j = dists[k].id;
      if (!stars[i].adjacentIds.includes(j)) stars[i].adjacentIds.push(j);
      if (!stars[j].adjacentIds.includes(i)) stars[j].adjacentIds.push(i);
    }
  }

  // Ensure full connectivity — BFS from star 0, bridge isolated components
  const visited = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const adj of stars[cur].adjacentIds) {
      if (!visited.has(adj)) { visited.add(adj); queue.push(adj); }
    }
  }
  for (let i = 0; i < stars.length; i++) {
    if (visited.has(i)) continue;
    let nearest = -1, nearDist = Infinity;
    for (const v of visited) {
      const dx = stars[i].position.x - stars[v].position.x;
      const dy = stars[i].position.y - stars[v].position.y;
      const dz = stars[i].position.z - stars[v].position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < nearDist) { nearDist = d; nearest = v; }
    }
    if (nearest >= 0) {
      stars[i].adjacentIds.push(nearest);
      stars[nearest].adjacentIds.push(i);
    }
    // BFS from newly connected star to absorb its component
    visited.add(i);
    const bq = [i];
    while (bq.length > 0) {
      const cur = bq.shift();
      for (const adj of stars[cur].adjacentIds) {
        if (!visited.has(adj)) { visited.add(adj); bq.push(adj); }
      }
    }
  }

  return { seed, stars };
}

export function generatePlanets(star) {
  const rng = mulberry32(star.seed);
  const planets = [];
  const sc = star.spectralClass;

  for (let i = 0; i < star.planetCount; i++) {
    let type;
    const r = rng();
    const inner = i < star.planetCount * 0.4;
    if (sc === 'O' || sc === 'B') { type = r < 0.3 ? 'lava' : r < 0.5 ? 'desert' : r < 0.7 ? 'gas_giant' : r < 0.85 ? 'ice' : 'ocean'; }
    else if (sc === 'M' || sc === 'K') { type = inner ? (r < 0.3 ? 'terran' : r < 0.5 ? 'desert' : r < 0.7 ? 'ocean' : 'lava') : (r < 0.4 ? 'ice' : r < 0.7 ? 'gas_giant' : 'desert'); }
    else { type = inner ? (r < 0.3 ? 'terran' : r < 0.5 ? 'desert' : r < 0.65 ? 'lava' : r < 0.8 ? 'ocean' : 'gas_giant') : (r < 0.3 ? 'gas_giant' : r < 0.5 ? 'ice' : r < 0.7 ? 'terran' : r < 0.85 ? 'ocean' : 'desert'); }

    const pt = CONFIG.planetTypes[type];
    const size = pt.sizeRange[0] + Math.floor(rng() * (pt.sizeRange[1] - pt.sizeRange[0] + 1));
    const hab = Math.floor(lerp(pt.habRange[0], pt.habRange[1], rng()));
    const met = Math.floor(lerp(pt.metalRange[0], pt.metalRange[1], rng()));
    const atm = pt.atmOptions[Math.floor(rng() * pt.atmOptions.length)];
    const hasRings = type === 'gas_giant' ? rng() < 0.6 : (type === 'ice' ? rng() < 0.15 : false);
    const special = rng() < 0.10 ? SPECIALS[Math.floor(rng() * SPECIALS.length)] : null;
    const pseed = hashInt(star.seed, i * 7 + 3);

    planets.push({
      id: i, name: star.name + ' ' + ROMAN[i],
      type, shaderType: pt.shader, label: pt.label,
      size, habitability: hab, metalRichness: met, atmosphere: atm,
      hasRings, special, seed: pseed,
      orbitRadius: 4 * CONFIG.spectral[sc].starScale * 3 + 3 + i * 5.5 + rng() * 2.5,
      orbitSpeed: 0.15 / (1 + i * 0.45),
      orbitPhase: rng() * Math.PI * 2,
      visualSize: type === 'gas_giant' ? 0.8 + rng() * 0.5 : 0.35 + rng() * 0.35,
      atmValue: atm === 'none' ? 0 : atm === 'thin' ? 0.15 : atm === 'standard' ? 0.35 : atm === 'dense' ? 0.55 : 0.4,
    });
  }
  return planets;
}
